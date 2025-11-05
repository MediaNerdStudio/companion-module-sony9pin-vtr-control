# MediaNerd RS-422 VTR – Bitfocus Companion Module

Control Sony 9‑pin (RS‑422) VTR/deck devices from Bitfocus Companion using the MediaNerd `sony9pin-nodejs` library.

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

## Notes
- Requires Node 18+
- Uses `sony9pin-nodejs` via local file dependency pointing at `../MediaNerd.RS422VTR`
