// index.js
// Cross-platform FTDI D2XX + Lawicel CANUSB probe.
//
// Purpose:
//   Exercise the FTDI D2XX byte-stream path used by CANUSB/Lawicel-style
//   adapters, then send simple Lawicel ASCII commands through FT_Write/FT_Read.
//
// Supported platforms:
//   Windows: loads ftd2xx.dll
//   Linux:   loads libftd2xx.so
//   macOS:   loads libftd2xx.dylib, best-effort only
//
// Usage:
//   node index.js
//   node index.js --cmd V
//   node index.js --cmd N
//   node index.js --tx 231 8 EB90010C0413101F
//   node index.js --index 1
//   node index.js --ft-baud 115200
//   node index.js --verbose-lib-load
//
// Requirements:
//   npm install koffi
//
//   Windows:
//     Put ftd2xx.dll beside this file, or install it where Windows can find it.
//
//   Linux:
//     Put libftd2xx.so beside this file, or install it where ld.so can find it.
//     If the kernel VCP driver grabs the adapter first, D2XX enumeration may fail.
//     For testing, you may need:
//       sudo rmmod ftdi_sio
//       sudo rmmod usbserial

const koffi = require("koffi");
const path = require("path");

const FT_OK = 0;

const statusNames = {
  0: "FT_OK",
  1: "FT_INVALID_HANDLE",
  2: "FT_DEVICE_NOT_FOUND",
  3: "FT_DEVICE_NOT_OPENED",
  4: "FT_IO_ERROR",
  5: "FT_INSUFFICIENT_RESOURCES",
  6: "FT_INVALID_PARAMETER",
  7: "FT_INVALID_BAUD_RATE",
  8: "FT_DEVICE_NOT_OPENED_FOR_ERASE",
  9: "FT_DEVICE_NOT_OPENED_FOR_WRITE",
  10: "FT_FAILED_TO_WRITE_DEVICE",
  11: "FT_EEPROM_READ_FAILED",
  12: "FT_EEPROM_WRITE_FAILED",
  13: "FT_EEPROM_ERASE_FAILED",
  14: "FT_EEPROM_NOT_PRESENT",
  15: "FT_EEPROM_NOT_PROGRAMMED",
  16: "FT_INVALID_ARGS",
  17: "FT_NOT_SUPPORTED",
  18: "FT_OTHER_ERROR",
  19: "FT_DEVICE_LIST_NOT_READY"
};

const FT_BITS_8 = 8;
const FT_STOP_BITS_1 = 0;
const FT_PARITY_NONE = 0;
const FT_PURGE_RX = 1;
const FT_PURGE_TX = 2;

function statusText(code) {
  return `${code} ${statusNames[code] || "UNKNOWN"}`;
}

function die(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function hexDump(buf) {
  return buf.toString("hex").match(/.{1,2}/g)?.join(" ") || "";
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    cmd: null,
    tx: null,
    index: 0,
    ftBaud: null,
    verboseLibLoad: false
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];

    if (a === "--index") out.index = Number(args[++i]);
    else if (a === "--ft-baud") out.ftBaud = Number(args[++i]);
    else if (a === "--cmd") out.cmd = args[++i];
    else if (a === "--verbose-lib-load") out.verboseLibLoad = true;
    else if (a === "--tx") {
      out.tx = {
        id: args[++i],
        len: Number(args[++i]),
        data: args[++i]
      };
    } else {
      die(`Unknown arg: ${a}`);
    }
  }

  return out;
}

const opt = parseArgs();

function platformName() {
  if (process.platform === "win32") return "Windows";
  if (process.platform === "linux") return "Linux";
  if (process.platform === "darwin") return "macOS";
  return process.platform;
}

function d2xxCandidates() {
  if (process.platform === "win32") {
    return [
      { label: "local", value: path.join(__dirname, "ftd2xx.dll") },
      { label: "system", value: "ftd2xx.dll" }
    ];
  }

  if (process.platform === "linux") {
    return [
      { label: "local", value: path.join(__dirname, "libftd2xx.so") },
      { label: "system", value: "libftd2xx.so" }
    ];
  }

  if (process.platform === "darwin") {
    return [
      { label: "local", value: path.join(__dirname, "libftd2xx.dylib") },
      { label: "system", value: "libftd2xx.dylib" }
    ];
  }

  return [];
}

function loadD2XX() {
  const candidates = d2xxCandidates();
  const errors = [];

  if (candidates.length === 0) {
    die(`Unsupported platform for this probe: ${process.platform}`);
  }

  for (const candidate of candidates) {
    try {
      if (opt.verboseLibLoad) {
        console.log(`Trying D2XX library (${candidate.label}): ${candidate.value}`);
      }
      const lib = koffi.load(candidate.value);
      console.log(`Loaded D2XX library: ${candidate.value}`);
      return lib;
    } catch (err) {
      errors.push({ candidate, message: err.message || String(err) });
    }
  }

  console.error("D2XX library not found or could not be loaded.");
  console.error("");
  console.error(`Platform: ${platformName()} (${process.platform}, ${process.arch})`);
  console.error("Tried:");
  for (const e of errors) {
    console.error(`  - ${e.candidate.value}`);
    if (opt.verboseLibLoad) {
      console.error(`    ${e.message}`);
    }
  }
  console.error("");

  if (process.platform === "win32") {
    console.error("Fix:");
    console.error("  Put ftd2xx.dll beside index.js, or install the FTDI D2XX driver package.");
    console.error("  Make sure Node.js and ftd2xx.dll are both x64 or both x86.");
  } else if (process.platform === "linux") {
    console.error("Fix:");
    console.error("  Put libftd2xx.so beside index.js, or install it in your system library path.");
    console.error("  If installed system-wide, you may need to run sudo ldconfig.");
    console.error("  If the adapter is grabbed by the kernel VCP driver, try:");
    console.error("    sudo rmmod ftdi_sio");
    console.error("    sudo rmmod usbserial");
  } else if (process.platform === "darwin") {
    console.error("Fix:");
    console.error("  Put libftd2xx.dylib beside index.js, or install the FTDI D2XX package for macOS.");
  }

  console.error("");
  console.error("Use --verbose-lib-load to show individual loader errors.");
  process.exit(1);
}

const ftdi = loadD2XX();

const FT_CreateDeviceInfoList = ftdi.func("uint FT_CreateDeviceInfoList(uint32_t* numDevs)");
const FT_Open = ftdi.func("uint FT_Open(int deviceNumber, void** handle)");
const FT_Close = ftdi.func("uint FT_Close(void* handle)");
const FT_SetBaudRate = ftdi.func("uint FT_SetBaudRate(void* handle, uint32_t baudRate)");
const FT_SetDataCharacteristics = ftdi.func("uint FT_SetDataCharacteristics(void* handle, uint8_t wordLength, uint8_t stopBits, uint8_t parity)");
const FT_SetTimeouts = ftdi.func("uint FT_SetTimeouts(void* handle, uint32_t readTimeout, uint32_t writeTimeout)");
const FT_Purge = ftdi.func("uint FT_Purge(void* handle, uint32_t mask)");
const FT_Write = ftdi.func("uint FT_Write(void* handle, void* buffer, uint32_t bytesToWrite, uint32_t* bytesWritten)");
const FT_Read = ftdi.func("uint FT_Read(void* handle, void* buffer, uint32_t bytesToRead, uint32_t* bytesReturned)");

function check(label, status) {
  console.log(`${label}: ${statusText(status)}`);
  return status === FT_OK;
}

function writeRaw(handle, s) {
  const buf = Buffer.from(s, "ascii");
  const written = [0];

  const st = FT_Write(handle, buf, buf.length, written);
  console.log(`TX ascii: ${JSON.stringify(s)} / ${hexDump(buf)} / wrote=${written[0]} / ${statusText(st)}`);

  if (st !== FT_OK) throw new Error(`FT_Write failed: ${statusText(st)}`);
  return written[0];
}

async function readSome(handle, quietMs = 30, maxMs = 250) {
  const start = Date.now();
  let out = Buffer.alloc(0);

  while (Date.now() - start < maxMs) {
    const rx = Buffer.alloc(4096);
    const read = [0];

    const st = FT_Read(handle, rx, rx.length, read);

    if (st !== FT_OK) {
      console.log(`FT_Read: ${statusText(st)}`);
      break;
    }

    if (read[0] > 0) {
      out = Buffer.concat([out, rx.subarray(0, read[0])]);
      await sleep(quietMs);
    } else {
      await sleep(quietMs);
    }
  }

  if (out.length > 0) {
    console.log(`RX hex:   ${hexDump(out)}`);
    console.log(`RX ascii: ${JSON.stringify(out.toString("ascii"))}`);
  } else {
    console.log("RX: <none>");
  }

  return out;
}

async function lawicelCommand(handle, cmd, label = cmd) {
  const line = cmd.endsWith("\r") ? cmd : `${cmd}\r`;
  console.log(`\n--- Lawicel ${label} ---`);
  writeRaw(handle, line);
  return await readSome(handle);
}

function makeLawicelTx(idText, len, dataHex) {
  const id = idText.replace(/^0x/i, "").toUpperCase();
  const cleanData = dataHex.replace(/[^0-9a-f]/gi, "").toUpperCase();

  if (id.length > 3) {
    throw new Error("This helper currently emits standard 11-bit Lawicel t-frames only.");
  }

  if (cleanData.length !== len * 2) {
    throw new Error(`Data length mismatch: len=${len}, data bytes=${cleanData.length / 2}`);
  }

  return `t${id.padStart(3, "0")}${len}${cleanData}`;
}

async function main() {
  console.log("D2XX Lawicel CANUSB probe");
  console.log(`Platform: ${platformName()} (${process.platform}, ${process.arch})`);
  console.log("Target behavior: D2XX open, configure timeouts, then Lawicel ASCII over FT_Write/FT_Read");
  console.log("Lawicel CAN bitrate command for 500k: S6");

  const numDevs = [0];
  let st = FT_CreateDeviceInfoList(numDevs);

  if (!check("FT_CreateDeviceInfoList", st)) return;

  console.log(`FTDI/D2XX-visible device count: ${numDevs[0]}`);

  if (numDevs[0] < 1) {
    console.log("No FTDI/D2XX-visible devices found.");
    if (process.platform === "linux") {
      console.log("");
      console.log("Linux notes:");
      console.log("  First confirm the USB device is actually FTDI-based:");
      console.log("    lsusb | grep -i -E '0403|ftdi'");
      console.log("");
      console.log("  FTDI VID is usually 0403. Common PIDs include:");
      console.log("    0403:6001  FT232R / FT232BM");
      console.log("    0403:6010  FT2232");
      console.log("    0403:6011  FT4232");
      console.log("    0403:6014  FT232H");
      console.log("    0403:6015  FT-X series");
      console.log("");
      console.log("  If no 0403 device appears, this is not a D2XX visibility problem.");
      console.log("  It means no FTDI-compatible USB device is currently attached.");
      console.log("");
      console.log("  If a 0403 device appears but D2XX still sees zero devices, then check:");
      console.log("    lsmod | grep -E 'ftdi_sio|usbserial'");
      console.log("    sudo rmmod ftdi_sio");
      console.log("    sudo rmmod usbserial");
      console.log("    sudo node index.js");
    }
    return;
  }

  const handle = [null];

  st = FT_Open(opt.index, handle);
  if (!check(`FT_Open(${opt.index})`, st)) return;

  console.log(`Handle: ${handle[0]}`);

  try {
    // FT_SetBaudRate configures the FTDI transport side, not CAN bitrate.
    // CAN bitrate is selected by the Lawicel command, for example S6 for 500k.
    if (opt.ftBaud) {
      check(`FT_SetBaudRate(${opt.ftBaud})`, FT_SetBaudRate(handle[0], opt.ftBaud));
    } else {
      console.log("FT_SetBaudRate: skipped. CAN bitrate is handled by Lawicel S6, not FT_SetBaudRate.");
    }

    check("FT_SetDataCharacteristics(8N1)", FT_SetDataCharacteristics(handle[0], FT_BITS_8, FT_STOP_BITS_1, FT_PARITY_NONE));
    check("FT_SetTimeouts(10,10)", FT_SetTimeouts(handle[0], 10, 10));
    check("FT_Purge(RX|TX)", FT_Purge(handle[0], FT_PURGE_RX | FT_PURGE_TX));

    if (opt.cmd) {
      await lawicelCommand(handle[0], opt.cmd, opt.cmd);
      return;
    }

    await lawicelCommand(handle[0], "V", "version");
    await lawicelCommand(handle[0], "N", "serial");
    await lawicelCommand(handle[0], "C", "close CAN");
    await lawicelCommand(handle[0], "S6", "set CAN bitrate 500k");
    await lawicelCommand(handle[0], "O", "open CAN");

    if (opt.tx) {
      const frame = makeLawicelTx(opt.tx.id, opt.tx.len, opt.tx.data);
      await lawicelCommand(handle[0], frame, `transmit ${frame}`);
    } else {
      console.log("\nNo --tx specified. Listening briefly for incoming Lawicel CAN frames...");
      await readSome(handle[0], 50, 1000);
    }
  } finally {
    st = FT_Close(handle[0]);
    check("FT_Close", st);
  }
}

main().catch(err => {
  console.error("\nFatal:");
  console.error(err.stack || err.message || err);
  process.exit(1);
});
