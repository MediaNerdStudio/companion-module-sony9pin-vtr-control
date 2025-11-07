# Sony RS-422 VTR Control – Bitfocus Companion Module

Control Sony 9-pin (RS-422) VTR/deck devices from Bitfocus Companion using the MediaNerd `sony9pin-nodejs` library.

- Connection: Windows COM port (38400 8O1 by default)
- Actions: Play, Stop, Rewind, Fast Forward, Record, Standby On/Off, Cue Up with Data, Current Time Sense (Auto/LTC/VITC), Status Sense
- Blackmagic AMP helpers (requires `sony9pin-nodejs` ≥ 0.5.0):
  - timecodeAuto
  - raw (cmd1/cmd2/data)
  - autoSkip(±clips)
  - listNextIdSingle(), listNextId(count)
  - clearPlaylist()
  - setPlaybackLoop({ enable, timeline })
  - setStopMode(mode: 0..3)
  - appendPreset(name, inTc, outTc)
  - seekToTimelinePosition(pos 0..1)
  - seekRelativeClip(±clips)
  - pollTimecode({ intervalMs, durationMs })
- Odetics helpers (requires `sony9pin-nodejs` ≥ 0.6.3):
  - Core: raw, deviceIdRequest, listFirstId, listNextId, listClipTc, setDeviceId, makeClip(variant), live, getEvent
  - Cue helpers: cueByTimecode, loadAndCueById, loadByIdAndCueByTimecode
- Variables: `timecode`, `status_flags`, `device_type`
- Presets: Transport, Timecode, Blackmagic AMP (Loop, Stop mode, Skip clips, Seek %, Clear playlist, List next IDs, Append preset), and Odetics (Device ID, First/Next, Next, Clip TC, Go LIVE, Cue by TC, Load+Cue by ID, Load ID + Cue TC)

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
- Depends on `sony9pin-nodejs@0.6.3` for Odetics helpers and retains AMP helpers
