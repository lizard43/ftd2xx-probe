// index.js
// D2XX + Lawicel CANUSB probe for NEOS-style CANUSB path.
// Mirrors app behavior:
//   canusb_getFirstAdapter()
//   canusb_Open(adapterName, "500", ...)
//   canusb_SetTimeouts(handle, 10, 10)
// Then tests Lawicel commands through FT_Write/FT_Read.
//
// Usage:
//   node index.js
//   node index.js --cmd V
//   node index.js --cmd N
//   node index.js --tx 231 8 EB90010C0413101F
//
// Requires:
//   npm install koffi
//   ftd2xx.dll beside this file

const koffi = require("koffi");

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

function statusText(code) {
  return `${code} ${statusNames[code] || "UNKNOWN"}`;
}

function die(msg) {
  console.error(msg);
  process.exit(1);
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
    ftBaud: null
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];

    if (a === "--index") out.index = Number(args[++i]);
    else if (a === "--ft-baud") out.ftBaud = Number(args[++i]);
    else if (a === "--cmd") out.cmd = args[++i];
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

const ftdi = koffi.load("./ftd2xx.dll");

const FT_CreateDeviceInfoList = ftdi.func("uint FT_CreateDeviceInfoList(uint32_t* numDevs)");
const FT_Open = ftdi.func("uint FT_Open(int deviceNumber, void** handle)");
const FT_Close = ftdi.func("uint FT_Close(void* handle)");
const FT_SetBaudRate = ftdi.func("uint FT_SetBaudRate(void* handle, uint32_t baudRate)");
const FT_SetDataCharacteristics = ftdi.func("uint FT_SetDataCharacteristics(void* handle, uint8_t wordLength, uint8_t stopBits, uint8_t parity)");
const FT_SetTimeouts = ftdi.func("uint FT_SetTimeouts(void* handle, uint32_t readTimeout, uint32_t writeTimeout)");
const FT_Purge = ftdi.func("uint FT_Purge(void* handle, uint32_t mask)");
const FT_Write = ftdi.func("uint FT_Write(void* handle, void* buffer, uint32_t bytesToWrite, uint32_t* bytesWritten)");
const FT_Read = ftdi.func("uint FT_Read(void* handle, void* buffer, uint32_t bytesToRead, uint32_t* bytesReturned)");

const FT_BITS_8 = 8;
const FT_STOP_BITS_1 = 0;
const FT_PARITY_NONE = 0;
const FT_PURGE_RX = 1;
const FT_PURGE_TX = 2;

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
  console.log("Target app behavior: canusb_Open(adapter, \"500\", 0, 0xFFFFFFFF, 1)");
  console.log("Lawicel CAN bitrate command for 500k: S6");

  const numDevs = [0];
  let st = FT_CreateDeviceInfoList(numDevs);

  if (!check("FT_CreateDeviceInfoList", st)) return;

  console.log(`FTDI/D2XX-visible device count: ${numDevs[0]}`);

  if (numDevs[0] < 1) {
    console.log("No FTDI/D2XX-visible devices found.");
    return;
  }

  const handle = [null];

  st = FT_Open(opt.index, handle);
  if (!check(`FT_Open(${opt.index})`, st)) return;

  console.log(`Handle: ${handle[0]}`);

  try {
    // This is FTDI UART transport baud, NOT CAN bitrate.
    // Leave unset by default so we do not confuse it with CAN 500k.
    // Use --ft-baud only if your fake dongle firmware expects a specific UART baud.
    if (opt.ftBaud) {
      check(`FT_SetBaudRate(${opt.ftBaud})`, FT_SetBaudRate(handle[0], opt.ftBaud));
    } else {
      console.log("FT_SetBaudRate: skipped. CAN bitrate is handled by Lawicel S6, not FT_SetBaudRate.");
    }

    check("FT_SetDataCharacteristics(8N1)", FT_SetDataCharacteristics(handle[0], FT_BITS_8, FT_STOP_BITS_1, FT_PARITY_NONE));

    // Matches CanSetting.cs: transmitTimeoutTime=10, receiveTimeoutTime=10.
    check("FT_SetTimeouts(10,10)", FT_SetTimeouts(handle[0], 10, 10));

    check("FT_Purge(RX|TX)", FT_Purge(handle[0], FT_PURGE_RX | FT_PURGE_TX));

    if (opt.cmd) {
      await lawicelCommand(handle[0], opt.cmd, opt.cmd);
      return;
    }

    // Basic CANUSB/Lawicel init sequence for 500k CAN.
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