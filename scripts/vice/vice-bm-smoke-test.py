#!/usr/bin/env python3
import subprocess, socket, struct, time, sys, os

DISPLAY_NUM = 99
VICE_PORT = 6502
VICE_BIN = "x64sc"
XVFB_CMD = ["Xvfb", f":{DISPLAY_NUM}", "-screen", "0", "640x480x24"]
VICE_CMD = [
    VICE_BIN,
    "-binarymonitor",
    f"-binarymonitoraddress", f"127.0.0.1:{VICE_PORT}",
    "-sounddev", "dummy",
    "-config", "/dev/null",
    "-warp",
]
os.environ["DISPLAY"] = f":{DISPLAY_NUM}"

# PETSCII screen codes for “HELLO WORLD” (uppercase, default power-on mode)
HELLO_WORLD_PETSCII = bytes([
    0xC8, 0xC5, 0xCC, 0xCC, 0xCF, 0x20, 0xD7, 0xCF, 0xD2, 0xCC, 0xC4
])

# ----------------------------------------------------------------------
# Utility helpers
# ----------------------------------------------------------------------
def wait_for_port(port, timeout=10):
    start = time.time()
    while time.time() - start < timeout:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.3):
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
            time.sleep(0.05)
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

def send_cmd(cmd_id, body=b"", req_id=1):
    header = bytes([0x02,0x02]) + struct.pack("<I", len(body)) + struct.pack("<I", req_id) + bytes([cmd_id])
    msg = header + body
    with socket.create_connection(("127.0.0.1", VICE_PORT), timeout=2) as s:
        _ = recv_all(s)     # drain async startup packets
        s.sendall(msg)
        return recv_all(s)

# ----------------------------------------------------------------------
# Binary monitor checks
# ----------------------------------------------------------------------
def check_vice_info():
    resp = send_cmd(0x85)
    if not find_packet(resp, 0x85, 1):
        raise RuntimeError("No valid 0x85 Info response found")
    print("[✓] VICE Info OK")

def write_mem(addr, data_bytes):
    end_addr = addr + len(data_bytes) - 1
    body = struct.pack("<BHHBH", 0, addr, end_addr, 0, 0) + data_bytes
    resp = send_cmd(0x02, body)
    if not find_packet(resp, 0x02, 1):
        raise RuntimeError(f"Memory write failed at ${addr:04X}")
    print(f"[✓] Wrote {len(data_bytes)} bytes to ${addr:04X}")

def read_mem(addr, length):
    end_addr = addr + length - 1
    body = struct.pack("<BHHBH", 0, addr, end_addr, 0, 0)
    resp = send_cmd(0x01, body)
    pkt = find_packet(resp, 0x01, 1)
    if not pkt:
        raise RuntimeError(f"Memory read failed at ${addr:04X}")
    count = int.from_bytes(pkt[12:14], "little")
    return pkt[14:14+count]

# ----------------------------------------------------------------------
# BASIC hello-world test
# ----------------------------------------------------------------------
def run_basic_hello():
    # Soft reset to ensure a clean READY state
    send_cmd(0xCC, bytes([0x00]))    # Reset type 0 (soft)
    time.sleep(0.8)

    # 10 PRINT "HELLO WORLD": 20 END
    program = bytes([
        0x0B,0x08,0x0A,0x00,0x99,
        0x22,0x48,0x45,0x4C,0x4C,0x4F,0x20,0x57,0x4F,0x52,0x4C,0x44,0x22,
        0x00,0x15,0x08,0x14,0x00,0x80,0x00,0x00
    ])
    program_base = 0x0801
    write_mem(program_base, program)

    # Update BASIC pointers so the interpreter sees the program.
    # `program_end` is stored as the pointer to the next line after the first 0-terminator.
    line_break = program.index(0x00, 4)
    program_end = struct.unpack("<H", program[line_break + 1:line_break + 3])[0]
    pointer_blob = struct.pack(
        "<HHHH",
        program_base,  # TXTTAB ($2B)
        program_end,   # VARTAB ($2D)
        program_end,   # ARYTAB ($2F)
        program_end    # STREND ($31)
    )
    write_mem(0x002B, pointer_blob)

    print("[+] BASIC program loaded.")

    # Feed “RUN” + RETURN (PETSCII carriage return)
    run_text = "RUN\r"
    body = struct.pack("<B", len(run_text)) + run_text.encode("ascii")
    send_cmd(0x72, body)
    print("[+] Executed RUN command.")
    time.sleep(1.5)

    screen = read_mem(0x0400, 1000)
    if HELLO_WORLD_PETSCII in screen:
        print("[✓] Detected 'HELLO WORLD' on screen.")
    else:
        snippet = " ".join(f"{b:02X}" for b in screen[:40])
        raise RuntimeError(
            "Did not detect 'HELLO WORLD' on screen. First row bytes: " + snippet
        )

# ----------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------
def main():
    print("[+] Starting Xvfb...")
    xvfb = subprocess.Popen(XVFB_CMD, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.5)

    print("[+] Launching VICE...")
    vice = subprocess.Popen(VICE_CMD, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    print(f"[+] Waiting for VICE to open port {VICE_PORT}...")
    if not wait_for_port(VICE_PORT, timeout=10):
        raise RuntimeError("Timeout waiting for VICE monitor port")

    # 1. Basic connectivity
    check_vice_info()

    # 2. Memory read/write
    test_value = b"\x42"
    write_mem(0x0800, test_value)
    val = read_mem(0x0800, 1)[0]
    if val != 0x42:
        raise RuntimeError(f"Memory check failed: expected 0x42, got {val:#x}")
    print("[✓] Memory read/write OK")

    # 3. BASIC “HELLO WORLD” run + screen verification
    run_basic_hello()

    # Cleanup
    print("[+] Cleaning up...")
    vice.terminate()
    xvfb.terminate()
    try: vice.wait(timeout=2)
    except subprocess.TimeoutExpired: vice.kill()
    try: xvfb.wait(timeout=2)
    except subprocess.TimeoutExpired: xvfb.kill()

    print("[✓] All checks passed successfully.")

# ----------------------------------------------------------------------
if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"[!] Error: {e}", file=sys.stderr)
        sys.exit(1)
