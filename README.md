# Sony RS-422 VTR Control – Bitfocus Companion Module

Control Sony 9-pin (RS-422) VTR/deck devices from Bitfocus Companion using the MediaNerd `sony9pin-nodejs` library.

- Connection: Windows COM port (38400 8O1 by default)
- Actions: Play, Stop, Rewind, Fast Forward, Record, Standby On/Off, Cue Up with Data, Current Time Sense (Auto/LTC/VITC), Status Sense
- Variables: `timecode`, `status_flags`, `device_type`

## Development

1. Install dependencies
```
npm i
```

2. Link into Companion (dev)
- Place this folder under your Companion `modules/` dev workspace or use Companion's dev loader.
- Or run Companion with this folder as a local module.

3. Configure in Companion UI
- Port (e.g., `COM3`)
- Serial options as needed
- Enable `Debug` for verbose TX/RX logging

## Hardware used

Tested with these RS‑422 interfaces and device server:

- Delock USB 2.0 Adapter to 1 x Serial RS‑422/485
  - https://www.delock.com/produkt/87585/merkmale.html?g=3RS4_4_1
- MOXA NPort 5150 – Serial Device Server
  - https://www.moxa.com/en/products/industrial-edge-connectivity/serial-device-servers/general-device-servers/nport-5100-series/nport-5150

## Notes
- Requires Node 18+
- Uses `sony9pin-nodejs` published on npm ("latest")
