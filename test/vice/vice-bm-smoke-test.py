#!/usr/bin/env python3
import subprocess, socket, struct, time, sys, os, tempfile

DISPLAY_NUM = 99
VICE_PORT = 6502
VICE_PORT2 = 6510  # second instance for autostart comparison
VICE_BIN = os.environ.get("VICE_BINARY", "x64sc")
XVFB_CMD = ["Xvfb", f":{DISPLAY_NUM}", "-screen", "0", "640x480x24"]
os.environ["DISPLAY"] = f":{DISPLAY_NUM}"

def vice_cmd_for_port(port: int):
    return [
        VICE_BIN,
        "-binarymonitor",
        f"-binarymonitoraddress", f"127.0.0.1:{port}",
        "-sounddev", "dummy",
        "-config", "/dev/null",
        "-warp",
    ]

# Screen-code sequence for "HELLO" in uppercase mode (power-on defaults).
HELLO_SCREEN_CODES = bytes([0x08, 0x05, 0x0C, 0x0C, 0x0F])

# ----------------------------------------------------------------------
# Timing helpers (millisecond resolution)
# ----------------------------------------------------------------------
def now_ns():
    return time.perf_counter_ns()

def ms_since(start_ns: int) -> int:
    return int((now_ns() - start_ns) / 1_000_000)

TIMINGS = []  # list of (scope, label, milliseconds)

def log_timing(scope: str, label: str, start_ns: int):
    elapsed_ms = ms_since(start_ns)
    TIMINGS.append((scope, label, elapsed_ms))
    print(f"[t] {scope}:{label}={elapsed_ms}ms")

# ----------------------------------------------------------------------
# Binary Monitor helpers
# ----------------------------------------------------------------------
def wait_for_port(port, timeout=10, host="127.0.0.1"):
    start = time.time()
    while time.time() - start < timeout:
        try:
            with socket.create_connection((host, port), timeout=0.3):
                return True
        except OSError:
            time.sleep(0.25)
    return False

def recv_all(sock):
    data = b""
    sock.settimeout(0.3)
    while True:
        try:
            chunk = sock.recv(4096)
            if not chunk:
                break
            data += chunk
            time.sleep(0.02)
        except Exception:
            break
    return data

def find_packet(stream, cmd_id, req_id=None):
    i = 0
    while i + 12 <= len(stream):
        if stream[i] == 0x02 and stream[i+1] == 0x02:
            body_len = int.from_bytes(stream[i+2:i+6], "little")
            pkt_len = 12 + body_len
            pkt = stream[i:i+pkt_len]
            if len(pkt) >= 12:
                cmd = pkt[6]
                err = pkt[7]
                rid = int.from_bytes(pkt[8:12], "little")
                if cmd == cmd_id and err == 0x00 and (req_id is None or rid == req_id):
                    return pkt
            i += pkt_len
        else:
            i += 1
    return None

def send_cmd(port, cmd_id, body=b"", req_id=1):
    header = bytes([0x02,0x02]) + struct.pack("<I", len(body)) + struct.pack("<I", req_id) + bytes([cmd_id])
    msg = header + body
    with socket.create_connection(("127.0.0.1", port), timeout=2) as s:
        _ = recv_all(s)     # drain async startup packets
        s.sendall(msg)
        return recv_all(s)

def check_vice_info(port: int, scope: str = "injection"):
    t0 = now_ns()
    resp = send_cmd(port, 0x85)
    log_timing(scope, "bm_info", t0)
    if not find_packet(resp, 0x85, 1):
        raise RuntimeError("No valid 0x85 Info response found")
    print("[✓] VICE Info OK")

def write_mem(port: int, addr: int, data_bytes: bytes, scope: str = "injection", label: str = None):
    end_addr = addr + len(data_bytes) - 1
    body = struct.pack("<BHHBH", 0, addr, end_addr, 0, 0) + data_bytes
    t0 = now_ns()
    resp = send_cmd(port, 0x02, body)
    log_timing(scope, label or f"bm_write_${addr:04X}", t0)
    if not find_packet(resp, 0x02, 1):
        raise RuntimeError(f"Memory write failed at ${addr:04X}")
    print(f"[✓] Wrote {len(data_bytes)} bytes to ${addr:04X}")

def read_mem(port: int, addr: int, length: int, scope: str = "injection", label: str = None):
    end_addr = addr + length - 1
    body = struct.pack("<BHHBH", 0, addr, end_addr, 0, 0)
    t0 = now_ns()
    resp = send_cmd(port, 0x01, body)
    log_timing(scope, label or f"bm_read_${addr:04X}", t0)
    pkt = find_packet(resp, 0x01, 1)
    if not pkt:
        raise RuntimeError(f"Memory read failed at ${addr:04X}")
    count = int.from_bytes(pkt[12:14], "little")
    return pkt[14:14+count]

# ----------------------------------------------------------------------
# BASIC hello-world
# ----------------------------------------------------------------------
def build_basic_hello_program_bytes() -> bytes:
    # Tokenized program body at $0801:
    # 10 PRINT "HELLO" : (end)
    return bytes([
        0x0E,0x08,  # pointer to next line ($080E)
        0x0A,0x00,  # line number 10
        0x99,       # PRINT token
        0x22,0x48,0x45,0x4C,0x4C,0x4F,0x22,  # "HELLO"
        0x00,       # EOL
        0x00,0x00,  # end of program (next line pointer = 0)
    ])

def run_basic_hello(port: int):
    # Soft reset to ensure a clean READY state
    t0 = now_ns()
    _ = send_cmd(port, 0xCC, bytes([0x00]))    # Reset type 0 (soft)
    log_timing("injection", "bm_reset_soft", t0)
    time.sleep(0.8)

    # Write program body to $0801
    program = build_basic_hello_program_bytes()
    program_base = 0x0801
    write_mem(port, program_base, program, scope="injection", label="bm_write_program")

    # Update BASIC pointers so the interpreter sees the program.
    program_end = program_base + len(program)
    pointer_blob = struct.pack(
        "<HHHH",
        program_base,  # TXTTAB ($2B)
        program_end,   # VARTAB ($2D)
        program_end,   # ARYTAB ($2F)
        program_end    # STREND ($31)
    )
    write_mem(port, 0x002B, pointer_blob, scope="injection", label="bm_patch_basic_pointers")

    print("[+] BASIC program loaded.")

    # Feed "RUN" + RETURN (PETSCII carriage return)
    run_text = "RUN\r"
    body = struct.pack("<B", len(run_text)) + run_text.encode("ascii")
    t1 = now_ns()
    _ = send_cmd(port, 0x72, body)
    log_timing("injection", "bm_keyboard_feed", t1)
    print("[+] Executed RUN command.")
    time.sleep(1.5)

    screen = read_mem(port, 0x0400, 1000, scope="injection", label="bm_read_screen")
    idx = screen.find(HELLO_SCREEN_CODES)
    if idx != -1:
        row, col = divmod(idx, 40)
        print(f"[✓] Detected 'HELLO' on screen at row {row}, column {col}.")
    else:
        preview = " ".join(f"{b:02X}" for b in screen[:80])
        raise RuntimeError("Did not detect 'HELLO' on screen. First 80 bytes: " + preview)

def write_temp_prg_file() -> str:
    body = build_basic_hello_program_bytes()
    prg = bytes([0x01, 0x08]) + body  # load address (LE) + body
    fd, path = tempfile.mkstemp(prefix="hello_", suffix=".prg")
    with os.fdopen(fd, "wb") as f:
        f.write(prg)
    return path

def run_autostart_hello(port: int):
    # Prepare PRG on disk
    t0 = now_ns()
    prg_path = write_temp_prg_file()
    log_timing("autostart", "prepare_prg", t0)

    # Launch new VICE with -autostart and binary monitor on a separate port
    cmd = vice_cmd_for_port(port) + ["-autostart", prg_path]
    t1 = now_ns()
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    log_timing("autostart", "spawn_vice", t1)

    t2 = now_ns()
    if not wait_for_port(port, timeout=10):
        raise RuntimeError("Timeout waiting for VICE (autostart) monitor port")
    log_timing("autostart", "wait_port", t2)

    # Info handshake
    check_vice_info(port, scope="autostart")

    # Poll screen for HELLO (autostart may still be running)
    t_wait = now_ns()
    timeout_ms = 3000
    found = False
    start_ms = ms_since(t_wait)  # zero-base
    while ms_since(t_wait) - start_ms < timeout_ms:
        screen = read_mem(port, 0x0400, 1000, scope="autostart", label="bm_read_screen")
        idx = screen.find(HELLO_SCREEN_CODES)
        if idx != -1:
            row, col = divmod(idx, 40)
            found = True
            print(f"[✓] [autostart] Detected 'HELLO' at row {row}, col {col}.")
            break
        time.sleep(0.05)
    log_timing("autostart", "wait_hello", t_wait)
    if not found:
        preview = " ".join(f"{b:02X}" for b in screen[:80])
        raise RuntimeError("[autostart] Did not detect 'HELLO'. First 80 bytes: " + preview)

    # Cleanup autostart instance
    t3 = now_ns()
    proc.terminate()
    try:
        proc.wait(timeout=2)
    except subprocess.TimeoutExpired:
        proc.kill()
    log_timing("autostart", "cleanup_vice", t3)
    try:
        os.remove(prg_path)
    except OSError:
        pass

# ----------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------
def main():
    # Xvfb
    print("[+] Starting Xvfb...")
    t0 = now_ns()
    xvfb = subprocess.Popen(XVFB_CMD, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    log_timing("injection", "spawn_xvfb", t0)
    time.sleep(0.5)

    # VICE (injection flow)
    print("[+] Launching VICE (injection flow)...")
    cmd = vice_cmd_for_port(VICE_PORT)
    t1 = now_ns()
    vice = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    log_timing("injection", "spawn_vice", t1)

    print(f"[+] Waiting for VICE to open port {VICE_PORT}...")
    t2 = now_ns()
    if not wait_for_port(VICE_PORT, timeout=10):
        raise RuntimeError("Timeout waiting for VICE monitor port")
    log_timing("injection", "wait_port", t2)

    # 1. Basic connectivity
    check_vice_info(VICE_PORT, scope="injection")

    # 2. Memory read/write sanity
    test_value = b"\x42"
    write_mem(VICE_PORT, 0x0800, test_value, scope="injection", label="bm_write_$0800")
    val = read_mem(VICE_PORT, 0x0800, 1, scope="injection", label="bm_read_$0800")[0]
    if val != 0x42:
        raise RuntimeError(f"Memory check failed: expected 0x42, got {val:#x}")
    print("[✓] Memory read/write OK")

    # 3. BASIC "HELLO" run + screen verification (injection)
    run_basic_hello(VICE_PORT)

    # Cleanup injection instance
    print("[+] Cleaning up injection instance...")
    t3 = now_ns()
    vice.terminate()
    try:
        vice.wait(timeout=2)
    except subprocess.TimeoutExpired:
        vice.kill()
    log_timing("injection", "cleanup_vice", t3)

    # 4. Autostart flow on a fresh VICE instance
    print("[+] Launching VICE (autostart flow)...")
    run_autostart_hello(VICE_PORT2)

    # Cleanup Xvfb
    print("[+] Cleaning up Xvfb...")
    t4 = now_ns()
    xvfb.terminate()
    try:
        xvfb.wait(timeout=2)
    except subprocess.TimeoutExpired:
        xvfb.kill()
    log_timing("autostart", "cleanup_xvfb", t4)

    print("[✓] All checks passed successfully.")
    # Summary
    print("[timings]")
    for scope, label, ms in TIMINGS:
        print(f"[timing] {scope}.{label} {ms}ms")

# ----------------------------------------------------------------------
if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"[!] Error: {e}", file=sys.stderr)
        sys.exit(1)
