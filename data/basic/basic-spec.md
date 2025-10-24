# C64 BASIC V2 Specification

## Language

### Overview

C64 BASIC V2 is an interpreted language with line-numbered statements, tokenised keywords, and a limited variable model. Execution flows linearly unless redirected by control statements.

### Variable Types

| Type | Suffix | Range | Storage | Notes |
|------|---------|--------|----------|-------|
| **Real (Float)** | none | ±2.9×10⁻³⁸ … ±1.7×10³⁸ | 5 bytes (1 exp, 4 mantissa) | Default type. |
| **Integer** | `%` | −32768 … 32767 | 2 bytes | Converted from float on assignment, slower. |
| **String** | `$` | 0–255 chars | 3-byte descriptor | Holds PETSCII text. |

Booleans are represented numerically: `FALSE=0`, `TRUE=−1` or any non-zero value.

### Variable Naming

- Only the **first two letters** of a name are significant (`CO`, `COCOS` → same variable).  
- Type suffix (`%`, `$`) distinguishes otherwise identical names.  
- Allowed: `A–Z`, `0–9`; must start with a letter.  
- Keywords and system variables (`ST`, `TI`, `TI$`, `FN`) are reserved.  
- Maximum logical name length ≈80 characters.

### Arrays

Declared via `DIM`, e.g. `DIM A(7)` (indices 0–7). Multi-dimensional arrays are supported (`DIM B$(4,5)`).

### Operators and Precedence

| Rank | Operators | Description |
|------|------------|-------------|
| 1 | `^` | Exponentiation |
| 2 | unary `+` `-` | Sign |
| 3 | `*` `/` | Multiplication, Division |
| 4 | `+` `-` | Addition, Subtraction, String concat |
| 5 | `<` `<=` `=` `>=` `>` `<>` | Comparison |
| 6 | `NOT` | Logical NOT |
| 7 | `AND` | Logical AND |
| 8 | `OR` | Logical OR |

Parentheses may nest up to 10 levels. Logical operators can also perform bitwise operations on 16‑bit integers.

### Syntax Definition (EBNF)

```
program      = { line }, endmarker ;
line         = nextptr word , lineno word , stmtlist , 0x00 ;
stmtlist     = statement , { ":" , statement } ;

statement =
    "REM" , { <any PETSCII except CR> } |
    "FOR" , var , "=" , expr , "TO" , expr , [ "STEP" , expr ] |
    "NEXT" , [ var ] |
    "IF" , expr , "THEN" , ( stmtlist | lineno ) |
    ( "GOTO" | "GO" , "TO" ) , lineno |
    "GOSUB" , lineno | "RETURN" |
    "ON" , expr , ( "GOTO" | "GOSUB" ) , lineno , { "," , lineno } |
    "DEF" , "FN" , fnname , "(" , var , ")" , "=" , expr |
    "INPUT" , [ prompt ] , varlist | "GET" , var | "PRINT" , [ printlist ] |
    "OPEN" , expr , "," , expr , [ "," , expr , [ "," , fnameMode ] ] |
    "CLOSE" , expr | "CMD" , expr , [ "," , exprlist ] |
    "LOAD" , fname [ "," , dev [ "," , secdev ] ] |
    "SAVE" , fname [ "," , dev [ "," , secdev ] ] |
    "VERIFY" , fname [ "," , dev [ "," , secdev ] ] |
    "READ" , varlist | "RESTORE" | "DATA" , datalist |
    "POKE" , expr , "," , expr | "PEEK" , "(" , expr , ")" |
    "WAIT" , expr , "," , expr , [ "," , expr ] |
    "SYS" , expr , { "," , expr } | var , "=" , expr |
    "USR" , "(" , expr , ")" |
    "RUN" , [ lineno ] | "STOP" | "END" | "CONT" |
    "LIST" , [ listRange ] | "NEW" | "CLR" |
    "FRE" , "(" , expr , ")" ;

expr         = term , { "OR" , term } ;
term         = factor , { "AND" , factor } ;
factor       = [ "NOT" ] , relation ;
relation     = sum , { ( "=" | "<" | ">" | "<=" | ">=" | "<>" ) , sum } ;
sum          = product , { ( "+" | "-" ) , product } ;
product      = power , { ( "*" | "/" ) , power } ;
power        = unary , { "^" , unary } ;
unary        = [ "+" | "-" ] , primary ;
primary      = number | string | var | fncall | "(" , expr , ")" ;

fncall       = ( "SGN" | "INT" | "ABS" | "USR" | "FRE" | "POS" | "SQR" | "RND" |
                 "LOG" | "EXP" | "COS" | "SIN" | "TAN" | "ATN" | "PEEK" | "LEN" |
                 "STR$" | "VAL" | "ASC" | "CHR$" | "LEFT$" | "RIGHT$" | "MID$" |
                 "TAB" | "SPC" ), "(" , [ expr , { "," , expr } ] , ")" ;

printlist    = [ expr | "#" , expr ] , { "," | ";" , [ expr | "#" , expr ] } ;
varlist      = var , { "," , var } ;
datalist     = datum , { "," , datum } ;
datum        = number | string | expr ;

fname        = string ; dev = expr ; secdev = expr ; fnameMode = string ;
lineno       = 0..65535 ;
var          = name [ "%" | "$" ] ; fnname = "FN" , name ;
name         = letter , { letter | digit } ;
prompt       = string , ";" ;
listRange    = lineno | "-" , lineno | lineno , "-" ;
number       = integer | float ; string = quoted PETSCII ;
```

### Commands and Functions

- **Flow:** `FOR…TO…[STEP…]…NEXT [var]`, `IF expr THEN (stmts|line)`, `GOTO`, `GO TO`, `GOSUB`, `RETURN`, `ON expr GOTO/GOSUB`, `DEF FN name(x)=expr`  
- **I/O:** `GET var$`, `INPUT ["prompt";] var[,var…]`, `PRINT [items]`, `SPC(n)`, `TAB(n)`, `POS(dummy)`  
- **Files:** `LOAD`, `SAVE`, `VERIFY`, `OPEN`, `CLOSE`, `GET#`, `INPUT#`, `PRINT#`, `CMD`, `ST`  
- **DATA:** `DATA`, `READ`, `RESTORE`  
- **Math/Logic:** `+ - * / ^`, comparisons, `AND OR NOT`; `SGN INT ABS RND SQR LOG EXP SIN COS TAN ATN`  
- **Strings:** `+` (concat), `LEN LEFT$ RIGHT$ MID$ STR$ VAL ASC CHR$`  
- **Memory:** `PEEK(addr)`, `POKE addr,val`, `WAIT addr,mask[,invert]`  
- **System:** `SYS addr[,p…]`, `USR(expr)` (fixed $0310)  
- **Execution:** `RUN [line]`, `STOP`, `END`, `CONT`  
- **Misc:** `REM`, `LIST`, `NEW`, `CLR`, `FRE(0)`, constants `π`, timers `TI`, `TI$`

---

## Tokenization

### Encoding Rules

- Keywords occupy **$80–$CB**; single‑byte tokens replace text during encoding.  
- Tokenisation **skips inside** strings (`"..."`) and remarks (`REM`).  
- Matching is **greedy**, **case‑insensitive**; e.g. `PRINT#` before `PRINT`.  
- If a line becomes empty, insert a single space (`$20`).  
- Characters are written as **PETSCII**, with identifiers uppercased; strings/comments unchanged.

### Keyword Table

| Hex | Keyword | Notes |
|------|----------|-------|
| 80 | END | |
| 81 | FOR | |
| 82 | NEXT | |
| 83 | DATA | |
| 84 | INPUT# | |
| 85 | INPUT | |
| 86 | DIM | |
| 87 | READ | |
| 88 | LET | Optional |
| 89 | GOTO | |
| 8A | RUN | |
| 8B | IF | |
| 8C | RESTORE | |
| 8D | GOSUB | |
| 8E | RETURN | |
| 8F | REM | De-tokenises remainder |
| 90 | STOP | |
| 91 | ON | |
| 92 | WAIT | |
| 93 | LOAD | |
| 94 | SAVE | |
| 95 | VERIFY | |
| 96 | DEF | |
| 97 | POKE | |
| 98 | PRINT# | |
| 99 | PRINT | |
| 9A | CONT | |
| 9B | LIST | |
| 9C | CLR | |
| 9D | CMD | |
| 9E | SYS | |
| 9F | OPEN | |
| A0 | CLOSE | |
| A1 | GET | |
| A2 | NEW | |
| A3 | TAB( | |
| A4 | TO | |
| A5 | FN | |
| A6 | SPC( | |
| A7 | THEN | |
| A8 | NOT | |
| A9 | STEP | |
| AA | + | |
| AB | - | |
| AC | * | |
| AD | / | |
| AE | ^ | |
| AF | AND | |
| B0 | OR | |
| B1 | > | |
| B2 | = | |
| B3 | < | |
| B4 | SGN | |
| B5 | INT | |
| B6 | ABS | |
| B7 | USR | |
| B8 | FRE | |
| B9 | POS | |
| BA | SQR | |
| BB | RND | |
| BC | LOG | |
| BD | EXP | |
| BE | COS | |
| BF | SIN | |
| C0 | TAN | |
| C1 | ATN | |
| C2 | PEEK | |
| C3 | LEN | |
| C4 | STR$ | |
| C5 | VAL | |
| C6 | ASC | |
| C7 | CHR$ | |
| C8 | LEFT$ | |
| C9 | RIGHT$ | |
| CA | MID$ | |
| CB | GO | For GO TO / GO SUB |

### PRG Layout

Each BASIC program is stored as a contiguous memory block starting at `$0801`:

1. **Load address** `$0801` (little‑endian).  
2. Repeated **line records**:  
   - Pointer to next line (absolute address, word LE)  
   - Line number (word LE)  
   - Tokenised bytes ending with `00`  
3. Final **terminator word `0000`**.

Pointers increase monotonically. The last line points to the terminator.

### Validation Rules

- Line numbers `0–65535` only.  
- Final sentinel `0000` required.  
- `ST` bits: 6 = EOF, 7 = Device not present.  
- `RND(seed<0)` re‑initialises RNG; `RND(0)` continues sequence.

---  
**Purpose:** Enables LLM‑safe, context‑efficient understanding of C64 BASIC syntax and token mapping for code generation and analysis.
