# FTD2XX Lawicel CANUSB Probe

A Node.js-based FTDI D2XX + Lawicel test utility for reverse engineering, validating, and emulating CANUSB-compatible USB CAN dongles.

This project exists to validate the *real* software path used by applications that communicate through:

```text
Application
 -> canusbdrv.dll
    -> FTD2XX.dll
       -> FTDI USB device
          -> Lawicel firmware
             -> CAN controller
```

Unlike simple COM-port terminal testing, this project exercises the **D2XX driver path** directly.

---

# Architecture

![Driver Architecture](./images/driverdiagram.jpg)

---

# Why This Exists

Many CANUSB-compatible applications do **not** talk to COM ports directly.

Instead, they:

- load `canusbdrv.dll`
- which internally loads `FTD2XX.dll`
- which communicates directly with FTDI USB devices

This means:

| Test Method | What It Actually Validates |
|---|---|
| PuTTY / COM port | VCP serial path only |
| FT_Prog sees device | FTDI/D2XX visibility |
| This project | Real D2XX byte-stream communication |
| Real target app | Full production stack |

A dongle may:

✅ work perfectly as `COM7`

while simultaneously:

❌ fail completely with `FTD2XX.dll`

This project helps determine where compatibility breaks.

---

# Goals

This utility validates:

- FTDI driver installation
- D2XX enumeration
- D2XX open/close behavior
- FT_Write / FT_Read functionality
- Lawicel ASCII command handling
- CAN bitrate initialization
- CAN transmit framing

It is especially useful when building:

- fake CANUSB dongles
- Lawicel emulators
- FTDI-based CAN bridges
- reverse engineering tools
- compatibility validation harnesses

---

# Project Stack

| Component | Purpose |
|---|---|
| Node.js | Runtime |
| koffi | Native DLL FFI |
| FTD2XX.dll | FTDI D2XX API |
| FTDI driver | USB transport |
| Lawicel ASCII | CANUSB protocol |

---

# Directory Layout

```text
ftd2xx-probe/
├── index.js
├── package.json
├── package-lock.json
├── ftd2xx.dll
├── README.md
└── images/
    └── driverdiagram.jpg
```

---

# Requirements

## Windows

This project targets Windows because:

- `FTD2XX.dll` is Windows-native
- target applications are Windows-based
- FTDI D2XX stack is Windows-centric

---

## Node.js

Recommended:

- Node.js 18.x
- Node.js 20.x

Use x64 Node with x64 `ftd2xx.dll`.

Architecture must match:

| Node | DLL |
|---|---|
| x64 Node | x64 DLL |
| x86 Node | x86 DLL |

---

## FTDI Driver

The FTDI D2XX driver stack must already be installed.
Download D2XX driver package from FTDI and place ftd2xx.dll beside index.js
https://ftdichip.com/drivers/d2xx-drivers/

This project does **not** install drivers.

Useful validation:

- Device appears in Device Manager
- FT_Prog can detect device
- `FT_CreateDeviceInfoList()` returns device count > 0

---

# Installing

## Install dependencies

```bash
npm install
```

---

# Running

## Default probe

```bash
node index.js
```

This performs:

1. FTDI device enumeration
2. FT_Open()
3. timeout configuration
4. Lawicel initialization sequence:
   - `V`
   - `N`
   - `C`
   - `S6`
   - `O`
5. passive receive test
6. FT_Close()

---

# Lawicel Commands

The utility speaks standard Lawicel ASCII.

Examples:

| Command | Meaning |
|---|---|
| `V` | firmware version |
| `N` | serial number |
| `C` | close CAN channel |
| `S6` | set CAN bitrate 500k |
| `O` | open CAN channel |

---

# Command-Line Usage

---

## Send arbitrary Lawicel command

```bash
node index.js --cmd V
```

```bash
node index.js --cmd N
```

```bash
node index.js --cmd S6
```

---

## Transmit CAN frame

```bash
node index.js --tx 231 8 EB90010C0413101F
```

Which generates:

```text
t2318EB90010C0413101F
```

and sends it through:

```text
FT_Write()
 -> Lawicel firmware
```

---

## Select FTDI device index

```bash
node index.js --index 1
```

Default:

```text
--index 0
```

---

## Set FTDI UART baud

```bash
node index.js --ft-baud 500000
```

IMPORTANT:

This is **NOT** CAN bitrate.

This configures the FTDI UART transport layer.

CAN bitrate is configured separately via Lawicel:

```text
S6 = 500k CAN
```

---

# Typical Successful Output

```text
D2XX Lawicel CANUSB probe

FT_CreateDeviceInfoList: 0 FT_OK
FTDI/D2XX-visible device count: 1

FT_Open(0): 0 FT_OK

--- Lawicel version ---
TX ascii: "V\r"
RX ascii: "V1234\r"

--- Lawicel serial ---
TX ascii: "N\r"
RX ascii: "N0001\r"

--- Lawicel set CAN bitrate 500k ---
TX ascii: "S6\r"

--- Lawicel open CAN ---
TX ascii: "O\r"
```

---

# Important Concepts

---

## VCP vs D2XX

This project intentionally bypasses COM ports.

### VCP path

```text
Application
 -> COM7
    -> FTDI VCP driver
```

### D2XX path

```text
Application
 -> FTD2XX.dll
    -> FTDI USB driver
```

These are different stacks.

A device may work in one but fail in the other.

---

## Why COM Port Testing Is Insufficient

PuTTY proving:

```text
V\r
```

works only validates:

```text
COM port serial transport
```

It does NOT prove:

```text
FT_Open()
FT_Write()
FT_Read()
```

will function correctly through D2XX.

This utility specifically validates the D2XX path.

---

# FTDI Device Compatibility

Devices must be genuine or D2XX-compatible FTDI hardware.

Examples that often work:

- FT232R
- FT232H
- FT2232H

Examples that generally do NOT work:

- CH340
- CP2102
- candleLight CAN adapters
- generic USB CDC devices

Reason:

`FTD2XX.dll` only communicates with FTDI-compatible hardware.

---

# Fake Dongle Development Workflow

Recommended progression:

| Stage | Goal |
|---|---|
| FT_Prog detection | verify FTDI visibility |
| This utility enumeration | verify D2XX access |
| Lawicel `V` response | verify protocol |
| `S6` / `O` | verify CAN init |
| CAN TX/RX | verify full behavior |
| Real app test | validate production compatibility |

---

# Reverse Engineering Notes

This project was built to support:

- Lawicel CANUSB emulation
- FTDI USB reverse engineering
- fake hardware validation
- proprietary automotive tooling analysis
- CAN bridge development

The utility intentionally exposes low-level D2XX behavior rather than abstracting it away.

---

# Useful FTDI APIs

The utility currently uses:

| API | Purpose |
|---|---|
| `FT_CreateDeviceInfoList()` | enumerate devices |
| `FT_Open()` | open FTDI device |
| `FT_SetTimeouts()` | configure RX/TX timeouts |
| `FT_Write()` | transmit Lawicel commands |
| `FT_Read()` | receive responses |
| `FT_Close()` | close device |

Potential future additions:

- `FT_GetDeviceInfoDetail()`
- `FT_ListDevices()`
- EEPROM inspection
- latency timer tuning
- async read loop
- CAN frame parser
- continuous monitor mode

# CANUSB Support

Manuals, Drivers, Example Software and Projects for the LAWICEL CANUSB.

- Manuals, Drivers, Example Software and Projects:  
  https://www.canusb.com/support/canusb-support/


# LAWICEL / SLCAN Protocol Resources

The term **LAWICEL** can be slightly confusing because it refers to both:

- the original company/vendor
- and the de-facto ASCII CAN serial protocol commonly used by CANUSB adapters

Over time, the protocol became widely known in Linux and SocketCAN ecosystems as:

```text
slcan
```

(short for **Serial Line CAN**)

The LAWICEL/SLCAN protocol is simple, human-readable ASCII framing for CAN communication.

Typical commands include:

```text
V
N
S6
O
C
t12381122334455667788
```

These commands are commonly transported over:

- FTDI USB serial devices
- D2XX driver stacks
- virtual COM ports (VCP)
- USB CAN dongles

---

# Recommended References

## Official LAWICEL / CANUSB Resources

- [LAWICEL CANUSB Support](https://www.canusb.com/support/canusb-support/)
- [CAN232 Protocol Reference PDF](https://www.canusb.com/files/can232_v3.pdf)
- [CANUSB Manual PDF](https://www.canusb.com/files/canusb_manual.pdf)

The CAN232 documentation is especially important because it effectively became the reference specification for the LAWICEL ASCII protocol.

---

# Linux / SocketCAN / SLCAN Resources

The Linux ecosystem refers to the LAWICEL protocol as:

```text
slcan
```

Useful resources:

- [Linux SocketCAN Documentation](https://www.kernel.org/doc/html/latest/networking/can.html)
- [python-can SLCAN Documentation](https://python-can.readthedocs.io/en/stable/interfaces/slcan.html)

---

# Why These Resources Matter

For reverse engineering, fake dongle development, and compatibility testing, these resources collectively define:

```text
ASCII protocol
+
USB transport expectations
+
real-world software implementations
```

Together they help explain:

- LAWICEL command framing
- CAN bitrate selection
- transmit/receive formatting
- timing behavior
- SLCAN compatibility expectations
- FTDI transport usage

---

# Important Concepts

## LAWICEL vs SLCAN

In practice:

| Term | Meaning |
|---|---|
| LAWICEL | Original vendor/protocol origin |
| CANUSB | LAWICEL USB CAN product |
| SLCAN | Linux/SocketCAN name for the protocol |

Most modern Linux tooling refers to the protocol as SLCAN even though it originated from LAWICEL hardware and documentation.

---

# Useful Search Terms

Often better than searching simply for "LAWICEL":

```text
slcan protocol
socketcan slcan
slcand
LAWICEL ASCII CAN
CAN232 protocol
```

These tend to produce more technical implementation details and source code references.

---

# Particularly Valuable References

For fake dongle and interoperability development, the most useful materials are typically:

1. CAN232 protocol PDF
2. Linux `slcan.c` driver source
3. `slcand` userspace implementation
4. `python-can` SLCAN implementation
5. FTDI D2XX SDK examples

These collectively provide:

- protocol specification
- framing examples
- timing behavior
- parser expectations
- transport assumptions
- real-world interoperability behavior

---

# License

Reverse engineering / interoperability / educational use.

No affiliation with FTDI, Lawicel, PEAK, or CANUSB vendors.