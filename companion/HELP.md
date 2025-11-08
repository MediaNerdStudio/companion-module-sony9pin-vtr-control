# Sony9pin VTR Control

## Supported protocols
- Sony 9-pin (RS-422) VTR Control
- Blackmagic AMP Control (over RS-422)
- Odetics Control (incl. EVS LSM)

Control Sony 9‑pin (RS‑422) VTR/deck devices and Blackmagic AMP devices from Bitfocus Companion. Uses the public `sony9pin-nodejs` library.

---

### Quick Information

- Transport: Play, Stop, FF/REW, Record, Standby On/Off, Eject, Sync Play, Preview/Review, Frame Step Fwd/Rev, Jog, Var Speed, Shuttle
- Preset/Select: In/Out Entry, In/Out Data Preset, Preroll Preset, Auto Mode On/Off, Input Check
- Sense: Status Sense, Current Time Sense (AUTO/LTC/VITC), TC Gen Sense, IN/OUT Data Sense
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
- Variables: timecode (and split hh/mm/ss/ff), status_flags, device_type
- Feedbacks: status_flag (matches any reported status flag)
- Polling + Reconnect: Configurable polling intervals and exponential backoff reconnect

- Odetics helpers (requires `sony9pin-nodejs` ≥ 0.6.3):
  - Core: raw, deviceIdRequest, listFirstId, listNextId, listClipTc, setDeviceId, makeClip(variant), live, getEvent
  - Cue helpers: cueByTimecode, loadAndCueById, loadByIdAndCueByTimecode

---

## Table of Content

- Quick Information
- Module Configuration
- Actions
- Feedbacks
- Variables
- Presets
- Hardware used
- Troubleshooting

---

## Module Configuration

When you add this module, configure:

1) Serial Port and Options
- Serial Port (e.g., `COM3` on Windows)
- Baud Rate (default 38400)
- Data Bits (7/8), Parity (none/odd/even), Stop Bits (1/2)
- Debug logging toggle

2) Polling
- Poll Timecode (default on) + Interval (ms)
- Poll Status (default on) + Interval (ms)

3) Reconnect
- Auto Reconnect (default on)
- Initial and Max backoff (ms)

> Tip: Ensure the VTR is in Remote/RS‑422 mode and media is present.

---

## Actions

- Transport: play, stop, fast forward, rewind, record, eject, standby_on, standby_off, sync_play, preview, review, frame_step_fwd, frame_step_rev
- Motion control: jog(delta -127..127), shuttle(speed -127..127), var_speed(speed -127..127)
- Locate: cue_up_with_data(hh,mm,ss,ff)
- Preset/Select: in_entry, out_entry, in_data_preset(hh,mm,ss,ff), out_data_preset(hh,mm,ss,ff), preroll_preset(hh,mm,ss,ff), auto_mode_on, auto_mode_off, input_check
- Sense: status_sense(start,size), timecode_sense(mode: auto/ltc/vitc), tc_gen_sense, in_data_sense, out_data_sense
- Blackmagic AMP:
  - bm_timecode_auto
  - bm_raw(cmd1, cmd2, data)
  - bm_auto_skip(delta)
  - bm_list_next_id_single
  - bm_list_next_id(count)
  - bm_clear_playlist
  - bm_set_playback_loop(enable, timeline)
  - bm_set_stop_mode(mode: 0..3)
  - bm_append_preset(name, in_hh/mm/ss/ff, out_hh/mm/ss/ff)
  - bm_seek_timeline_pos(pos 0..1)
  - bm_seek_relative_clip(delta)
  - bm_poll_timecode(intervalMs, durationMs)

- Odetics:
  - od_raw(cmd1, cmd2, data)
  - od_device_id_request
  - od_list_first_id, od_list_next_id
  - od_list_clip_tc
  - od_set_device_id(bytes)
  - od_make_clip(variant, data)
  - od_live(bytes)
  - od_get_event
  - od_cue_by_timecode(hh,mm,ss,ff)
  - od_load_and_cue_by_id(lsmId)
  - od_load_by_id_and_cue_by_tc(lsmId, hh,mm,ss,ff)

---

## Feedbacks

- status_flag
  - Options: flag string (e.g., PLAY, STOP, RECORD, STANDBY, STILL, SHUTTLE)
  - True when the reported status flags include the string

---

## Variables

- `$(sony9pin-vtr:timecode)` → `HH:MM:SS:FF`
- `$(sony9pin-vtr:timecode_hh)` → `HH`
- `$(sony9pin-vtr:timecode_mm)` → `MM`
- `$(sony9pin-vtr:timecode_ss)` → `SS`
- `$(sony9pin-vtr:timecode_ff)` → `FF`
- `$(sony9pin-vtr:status_flags)` → Comma‑separated flags, e.g. `SERVO_REF_MISSING, STANDBY, STOP, STILL, CUE_UP`
- `$(sony9pin-vtr:device_type)` → Hex code

---

## Presets

- Transport buttons for Play, Stop, FF, REW, Record, Standby On/Off with colored feedbacks
- Timecode display buttons:
  - TC Full (size 18): `$(sony9pin-vtr:timecode)`
  - TC Hours: `$(sony9pin-vtr:timecode_hh)`
  - TC Minutes: `$(sony9pin-vtr:timecode_mm)`
  - TC Seconds: `$(sony9pin-vtr:timecode_ss)`
  - TC Frames: `$(sony9pin-vtr:timecode_ff)`

- Blackmagic AMP (category):
  - Loop Clip ON, Loop Timeline ON, Loop OFF
  - Stop=Freeze Last
  - Skip +1 Clip, Skip -1 Clip
  - Seek 50%
  - Clear Playlist
  - List Next IDs (count)
  - Append Preset Demo

---

## Hardware used

Tested with these RS‑422 interfaces and device server:

- Delock USB 2.0 Adapter to 1 x Serial RS‑422/485
  - https://www.delock.com/produkt/87585/merkmale.html?g=3RS4_4_1
- MOXA NPort 5150 – Serial Device Server
  - https://www.moxa.com/en/products/industrial-edge-connectivity/serial-device-servers/general-device-servers/nport-5100-series/nport-5150

Any reliable RS‑422 interface or device server with 38400 8O1 should work.

---

## Troubleshooting

- No ACK / no control:
  - Ensure deck is in Remote/RS‑422 mode and media is present
  - Verify COM port and serial parameters (38400 8O1)
- Frequent TIMEOUT/NAK:
  - Increase polling intervals, add small delays between actions
  - Use Status Sense before motion
- No timecode:
  - Use Timecode Sense AUTO; ensure VITC/LTC enabled on the deck
- Blackmagic AMP:
  - Use `bm_raw` with the exact cmd1/cmd2/data per device manual
  - Some commands depend on deck/firmware support

- Odetics:
  - Use `od_raw` for device-specific commands not listed above
  - Some commands depend on device firmware and configuration

---

### Credits
- Library: `sony9pin-nodejs` (npm)
- Module author: MediaNerd
