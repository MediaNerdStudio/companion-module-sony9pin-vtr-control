import { InstanceBase, runEntrypoint, InstanceStatus } from '@companion-module/base'
import { VTR422, CurrentTimeSenseFlag, BlackmagicAMP, Odetics, Encoder } from 'sony9pin-nodejs'

class RS422VTRInstance extends InstanceBase {
  constructor(internal) {
    super(internal)
    this.vtr = null
    this.bm = null
    this.od = null
    this.config = {}
    this.statusTimer = null
    this.timecodeTimer = null
    this.reconnectTimer = null
    this.reconnectDelay = 0
    this._statusFlagsSet = new Set()
    this._connStatus = InstanceStatus.Disconnected
  }

  async init(config) {
    this.config = config
    this.updateStatus(InstanceStatus.Disconnected)

    this.setActionDefinitions(this.getActionDefinitions())
    this.setVariableDefinitions(this.getVariableDefinitions())
    this.setPresetDefinitions(this.getPresetDefinitions())
    this.setFeedbackDefinitions(this.getFeedbackDefinitions())

    // Wrap updateStatus to cache connection status and trigger feedback checks
    if (!this._updateStatus) {
      this._updateStatus = this.updateStatus.bind(this)
      this.updateStatus = (status, message) => {
        this._connStatus = status
        try { this.checkFeedbacks?.('connection_state') } catch {}
        return this._updateStatus(status, message)
      }
    }

    await this.initConnection()
  }

  async destroy() {
    if (this.statusTimer) {
      clearInterval(this.statusTimer)
      this.statusTimer = null
    }
    if (this.timecodeTimer) {
      clearInterval(this.timecodeTimer)
      this.timecodeTimer = null
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.vtr) {
      try {
        if (this.vtr.isOpen()) await this.vtr.stop().catch(() => {})
      } catch {}
      try {
        await this.vtr.close()
      } catch {}
      this.vtr = null
    }
    this.bm = null
  }

  async configUpdated(config) {
    this.config = config
    await this.initConnection()
  }

  getConfigFields() {
    return [
      {
        type: 'textinput',
        id: 'portPath',
        label: 'Serial Port (e.g., COM3)',
        width: 6,
        default: 'COM1',
      },
      {
        type: 'number',
        id: 'baudRate',
        label: 'Baud Rate',
        width: 3,
        default: 38400,
        min: 1200,
        max: 921600,
        step: 1,
      },
      {
        type: 'dropdown',
        id: 'dataBits',
        label: 'Data Bits',
        width: 3,
        default: 8,
        choices: [
          { id: 7, label: '7' },
          { id: 8, label: '8' },
        ],
      },
      {
        type: 'dropdown',
        id: 'parity',
        label: 'Parity',
        width: 3,
        default: 'odd',
        choices: [
          { id: 'none', label: 'None' },
          { id: 'odd', label: 'Odd' },
          { id: 'even', label: 'Even' },
        ],
      },
      {
        type: 'number',
        id: 'stopBits',
        label: 'Stop Bits',
        width: 3,
        default: 1,
        min: 1,
        max: 2,
        step: 1,
      },
      {
        type: 'checkbox',
        id: 'debug',
        label: 'Enable Debug Logging',
        width: 3,
        default: false,
      },
      { type: 'static-text', id: 'sep1', label: '—', value: 'Polling' },
      {
        type: 'checkbox', id: 'pollTimecode', label: 'Poll Timecode', width: 3, default: true,
      },
      {
        type: 'number', id: 'pollTimecodeIntervalMs', label: 'Timecode Interval (ms)', width: 3, default: 200, min: 20, max: 5000, step: 10,
      },
      {
        type: 'checkbox', id: 'pollStatus', label: 'Poll Status', width: 3, default: true,
      },
      {
        type: 'number', id: 'pollStatusIntervalMs', label: 'Status Interval (ms)', width: 3, default: 500, min: 100, max: 10000, step: 50,
      },
      { type: 'static-text', id: 'sep2', label: '—', value: 'Reconnect' },
      {
        type: 'checkbox', id: 'reconnect', label: 'Auto Reconnect', width: 3, default: true,
      },
      {
        type: 'number', id: 'reconnectInitialMs', label: 'Reconnect Initial (ms)', width: 3, default: 1000, min: 250, max: 60000, step: 50,
      },
      {
        type: 'number', id: 'reconnectMaxMs', label: 'Reconnect Max (ms)', width: 3, default: 15000, min: 1000, max: 120000, step: 250,
      },
    ]
  }

  getVariableDefinitions() {
    return [
      { variableId: 'timecode', name: 'Current Timecode (HH:MM:SS:FF)' },
      { variableId: 'timecode_hh', name: 'Timecode Hours (HH)' },
      { variableId: 'timecode_mm', name: 'Timecode Minutes (MM)' },
      { variableId: 'timecode_ss', name: 'Timecode Seconds (SS)' },
      { variableId: 'timecode_ff', name: 'Timecode Frames (FF)' },
      { variableId: 'status_flags', name: 'Status Flags' },
      { variableId: 'device_type', name: 'Device Type (hex)' },
    ]
  }

  getActionDefinitions() {
    return {
      play: {
        name: 'Play',
        options: [],
        callback: async () => this.safeSend(() => this.vtr.play()),
      },
      stop: {
        name: 'Stop',
        options: [],
        callback: async () => this.safeSend(() => this.vtr.stop()),
      },
      ff: {
        name: 'Fast Forward',
        options: [],
        callback: async () => this.safeSend(() => this.vtr.fastForward()),
      },
      rew: {
        name: 'Rewind',
        options: [],
        callback: async () => this.safeSend(() => this.vtr.rewind()),
      },
      record: {
        name: 'Record',
        options: [],
        callback: async () => this.safeSend(() => this.vtr.record()),
      },
      standby_on: {
        name: 'Standby On',
        options: [],
        callback: async () => this.safeSend(() => this.vtr.standbyOn()),
      },
      standby_off: {
        name: 'Standby Off',
        options: [],
        callback: async () => this.safeSend(() => this.vtr.standbyOff()),
      },
      eject: {
        name: 'Eject',
        options: [],
        callback: async () => this.safeSend(() => this.vtr.eject()),
      },
      preview: {
        name: 'Preview',
        options: [],
        callback: async () => this.safeSend(() => this.vtr.preview()),
      },
      review: {
        name: 'Review',
        options: [],
        callback: async () => this.safeSend(() => this.vtr.review()),
      },
      sync_play: {
        name: 'Sync Play',
        options: [],
        callback: async () => this.safeSend(() => this.vtr.syncPlay()),
      },
      frame_step_fwd: {
        name: 'Frame Step Forward',
        options: [],
        callback: async () => this.safeSend(() => this.vtr.send(Encoder.frameStepForward())),
      },
      frame_step_rev: {
        name: 'Frame Step Reverse',
        options: [],
        callback: async () => this.safeSend(() => this.vtr.send(Encoder.frameStepReverse())),
      },
      jog: {
        name: 'Jog',
        options: [ { type: 'number', id: 'delta', label: 'Delta (-127..127)', default: 1, min: -127, max: 127 } ],
        callback: async (e) => this.safeSend(() => this.vtr.send(Encoder.jog(e.options.delta))),
      },
      var_speed: {
        name: 'Var Speed',
        options: [ { type: 'number', id: 'speed', label: 'Speed (-127..127)', default: 10, min: -127, max: 127 } ],
        callback: async (e) => this.safeSend(() => this.vtr.send(Encoder.varSpeed(e.options.speed))),
      },
      shuttle: {
        name: 'Shuttle',
        options: [ { type: 'number', id: 'speed', label: 'Speed (-127..127)', default: 20, min: -127, max: 127 } ],
        callback: async (e) => this.safeSend(() => this.vtr.send(Encoder.shuttle(e.options.speed))),
      },
      cue_up_with_data: {
        name: 'Cue Up With Data',
        options: [
          { type: 'number', id: 'hh', label: 'Hours', default: 0, min: 0, max: 23 },
          { type: 'number', id: 'mm', label: 'Minutes', default: 0, min: 0, max: 59 },
          { type: 'number', id: 'ss', label: 'Seconds', default: 0, min: 0, max: 59 },
          { type: 'number', id: 'ff', label: 'Frames', default: 0, min: 0, max: 59 },
        ],
        callback: async (event) =>
          this.safeSend(() => this.vtr.cueUpWithData(event.options.hh, event.options.mm, event.options.ss, event.options.ff)),
      },
      timecode_sense: {
        name: 'Current Time Sense',
        options: [
          {
            type: 'dropdown',
            id: 'mode',
            label: 'Mode',
            default: 'auto',
            choices: [
              { id: 'auto', label: 'AUTO' },
              { id: 'ltc', label: 'LTC' },
              { id: 'vitc', label: 'VITC' },
            ],
          },
        ],
        callback: async (event) => {
          const mode = event.options.mode
          const flag = mode === 'ltc' ? CurrentTimeSenseFlag.LTC_TC : mode === 'vitc' ? CurrentTimeSenseFlag.VITC_TC : CurrentTimeSenseFlag.AUTO
          return this.safeSend(() => this.vtr.currentTimeSense(flag))
        },
      },
      status_sense: {
        name: 'Status Sense',
        options: [
          { type: 'number', id: 'start', label: 'Start Page', default: 0, min: 0, max: 255 },
          { type: 'number', id: 'size', label: 'Size', default: 10, min: 1, max: 13 },
        ],
        callback: async (event) => this.safeSend(() => this.vtr.statusSense(event.options.start, event.options.size)),
      },
      // Preset/select controls
      in_entry: { name: 'In Entry', options: [], callback: async () => this.safeSend(() => this.vtr.send(Encoder.inEntry())) },
      out_entry: { name: 'Out Entry', options: [], callback: async () => this.safeSend(() => this.vtr.send(Encoder.outEntry())) },
      in_data_preset: {
        name: 'In Data Preset',
        options: [
          { type: 'number', id: 'hh', label: 'Hours', default: 0, min: 0, max: 23 },
          { type: 'number', id: 'mm', label: 'Minutes', default: 0, min: 0, max: 59 },
          { type: 'number', id: 'ss', label: 'Seconds', default: 0, min: 0, max: 59 },
          { type: 'number', id: 'ff', label: 'Frames', default: 0, min: 0, max: 59 },
        ],
        callback: async (e) => this.safeSend(() => this.vtr.send(Encoder.inDataPreset(e.options.hh, e.options.mm, e.options.ss, e.options.ff))),
      },
      out_data_preset: {
        name: 'Out Data Preset',
        options: [
          { type: 'number', id: 'hh', label: 'Hours', default: 0, min: 0, max: 23 },
          { type: 'number', id: 'mm', label: 'Minutes', default: 0, min: 0, max: 59 },
          { type: 'number', id: 'ss', label: 'Seconds', default: 0, min: 0, max: 59 },
          { type: 'number', id: 'ff', label: 'Frames', default: 0, min: 0, max: 59 },
        ],
        callback: async (e) => this.safeSend(() => this.vtr.send(Encoder.outDataPreset(e.options.hh, e.options.mm, e.options.ss, e.options.ff))),
      },
      preroll_preset: {
        name: 'Preroll Preset',
        options: [
          { type: 'number', id: 'hh', label: 'Hours', default: 0, min: 0, max: 23 },
          { type: 'number', id: 'mm', label: 'Minutes', default: 0, min: 0, max: 59 },
          { type: 'number', id: 'ss', label: 'Seconds', default: 0, min: 0, max: 59 },
          { type: 'number', id: 'ff', label: 'Frames', default: 0, min: 0, max: 59 },
        ],
        callback: async (e) => this.safeSend(() => this.vtr.send(Encoder.prerollPreset(e.options.hh, e.options.mm, e.options.ss, e.options.ff))),
      },
      auto_mode_on: { name: 'Auto Mode On', options: [], callback: async () => this.safeSend(() => this.vtr.send(Encoder.autoModeOn())) },
      auto_mode_off: { name: 'Auto Mode Off', options: [], callback: async () => this.safeSend(() => this.vtr.send(Encoder.autoModeOff())) },
      input_check: { name: 'Input Check', options: [], callback: async () => this.safeSend(() => this.vtr.send(Encoder.inputCheck())) },
      // Sense helpers
      tc_gen_sense: { name: 'TC Gen Sense', options: [], callback: async () => this.safeSend(() => this.vtr.send(Encoder.tcGenSense())) },
      in_data_sense: { name: 'IN Data Sense', options: [], callback: async () => this.safeSend(() => this.vtr.send(Encoder.inDataSense())) },
      out_data_sense: { name: 'OUT Data Sense', options: [], callback: async () => this.safeSend(() => this.vtr.send(Encoder.outDataSense())) },

      // Blackmagic AMP helpers
      bm_timecode_auto: {
        name: 'BM Timecode AUTO',
        options: [],
        callback: async () => this.safeSend(() => this.bm?.timecodeAuto?.()),
      },
      bm_raw: {
        name: 'BM RAW (cmd1/cmd2/data...)',
        options: [
          { type: 'textinput', id: 'cmd1', label: 'cmd1 (hex e.g. 0x61)', default: '0x61' },
          { type: 'textinput', id: 'cmd2', label: 'cmd2 (hex e.g. 0x0C)', default: '0x0C' },
          { type: 'textinput', id: 'data', label: 'data bytes (space/comma-separated, hex or dec)', default: '' },
        ],
        callback: async (e) => {
          const p = (v) => {
            const s = String(v).trim()
            return s.startsWith('0x') ? parseInt(s, 16) : parseInt(s, 10)
          }
          const d = String(e.options.data || '')
            .split(/[ ,]+/)
            .map((x) => x.trim())
            .filter((x) => x.length)
            .map(p)
          return this.safeSend(() => this.bm?.raw?.(p(e.options.cmd1), p(e.options.cmd2), d))
        },
      },
      bm_auto_skip: {
        name: 'BM AutoSkip (±clips)',
        options: [ { type: 'number', id: 'delta', label: 'Delta clips (-10..10)', default: 1, min: -10, max: 10 } ],
        callback: async (e) => this.safeSend(() => this.bm?.autoSkip?.(e.options.delta|0)),
      },
      bm_list_next_id_single: {
        name: 'BM ListNextID (single)',
        options: [],
        callback: async () => this.safeSend(() => this.bm?.listNextIdSingle?.()),
      },
      bm_list_next_id: {
        name: 'BM ListNextID (count)',
        options: [ { type: 'number', id: 'count', label: 'Count (1..10)', default: 3, min: 1, max: 10 } ],
        callback: async (e) => this.safeSend(() => this.bm?.listNextId?.(e.options.count|0)),
      },
      bm_clear_playlist: {
        name: 'BM Clear Playlist',
        options: [],
        callback: async () => this.safeSend(() => this.bm?.clearPlaylist?.()),
      },
      bm_set_playback_loop: {
        name: 'BM Set Playback Loop',
        options: [
          { type: 'checkbox', id: 'enable', label: 'Enable', default: true },
          { type: 'checkbox', id: 'timeline', label: 'Timeline (vs Single Clip)', default: false },
        ],
        callback: async (e) => this.safeSend(() => this.bm?.setPlaybackLoop?.({ enable: !!e.options.enable, timeline: !!e.options.timeline })),
      },
      bm_set_stop_mode: {
        name: 'BM Set Stop Mode',
        options: [
          { type: 'dropdown', id: 'mode', label: 'Mode', default: 1, choices: [
            { id: 0, label: '0 - Off' },
            { id: 1, label: '1 - Freeze Last' },
            { id: 2, label: '2 - Freeze Next' },
            { id: 3, label: '3 - Black' },
          ]},
        ],
        callback: async (e) => this.safeSend(() => this.bm?.setStopMode?.(Number(e.options.mode))),
      },
      bm_append_preset: {
        name: 'BM Append Preset',
        options: [
          { type: 'textinput', id: 'name', label: 'Name', default: 'Preset' },
          { type: 'number', id: 'in_hh', label: 'IN HH', default: 0, min: 0, max: 23 },
          { type: 'number', id: 'in_mm', label: 'IN MM', default: 0, min: 0, max: 59 },
          { type: 'number', id: 'in_ss', label: 'IN SS', default: 5, min: 0, max: 59 },
          { type: 'number', id: 'in_ff', label: 'IN FF', default: 0, min: 0, max: 59 },
          { type: 'number', id: 'out_hh', label: 'OUT HH', default: 0, min: 0, max: 23 },
          { type: 'number', id: 'out_mm', label: 'OUT MM', default: 0, min: 0, max: 59 },
          { type: 'number', id: 'out_ss', label: 'OUT SS', default: 10, min: 0, max: 59 },
          { type: 'number', id: 'out_ff', label: 'OUT FF', default: 0, min: 0, max: 59 },
        ],
        callback: async (e) => this.safeSend(() => this.bm?.appendPreset?.(
          e.options.name,
          { hh: e.options.in_hh|0, mm: e.options.in_mm|0, ss: e.options.in_ss|0, ff: e.options.in_ff|0 },
          { hh: e.options.out_hh|0, mm: e.options.out_mm|0, ss: e.options.out_ss|0, ff: e.options.out_ff|0 },
        )),
      },
      bm_seek_timeline_pos: {
        name: 'BM Seek Timeline Position',
        options: [ { type: 'number', id: 'pos', label: 'Position (0..1)', default: 0.5, min: 0, max: 1, step: 0.01 } ],
        callback: async (e) => this.safeSend(() => this.bm?.seekToTimelinePosition?.(Number(e.options.pos))),
      },
      bm_seek_relative_clip: {
        name: 'BM Seek Relative Clip (±clips)',
        options: [ { type: 'number', id: 'delta', label: 'Delta clips (-10..10)', default: 1, min: -10, max: 10 } ],
        callback: async (e) => this.safeSend(() => this.bm?.seekRelativeClip?.(e.options.delta|0)),
      },
      bm_poll_timecode: {
        name: 'BM Poll Timecode (AUTO)',
        options: [
          { type: 'number', id: 'intervalMs', label: 'Interval (ms)', default: 250, min: 20, max: 5000, step: 10 },
          { type: 'number', id: 'durationMs', label: 'Duration (ms)', default: 2000, min: 100, max: 60000, step: 50 },
        ],
        callback: async (e) => this.safeSend(() => this.bm?.pollTimecode?.({ intervalMs: e.options.intervalMs|0, durationMs: e.options.durationMs|0 })),
      },

      // Odetics helpers
      od_raw: {
        name: 'OD RAW (cmd1/cmd2/data...)',
        options: [
          { type: 'textinput', id: 'cmd1', label: 'cmd1 (hex e.g. 0xA0)', default: '0xA0' },
          { type: 'textinput', id: 'cmd2', label: 'cmd2 (hex e.g. 0x21)', default: '0x21' },
          { type: 'textinput', id: 'data', label: 'data bytes (space/comma-separated, hex or dec)', default: '' },
        ],
        callback: async (e) => {
          const p = (v) => { const s = String(v).trim(); return s.startsWith('0x') ? parseInt(s, 16) : parseInt(s, 10) }
          const d = String(e.options.data || '').split(/[ ,]+/).map((x)=>x.trim()).filter(Boolean).map(p)
          return this.safeSend(() => this.od?.raw?.(p(e.options.cmd1), p(e.options.cmd2), d))
        },
      },
      od_device_id_request: { name: 'OD Device ID Request', options: [], callback: async () => this.safeSend(() => this.od?.deviceIdRequest?.()) },
      od_list_first_id: { name: 'OD List First ID', options: [], callback: async () => this.safeSend(() => this.od?.listFirstId?.()) },
      od_list_next_id: { name: 'OD List Next ID', options: [], callback: async () => this.safeSend(() => this.od?.listNextId?.()) },
      od_list_clip_tc: { name: 'OD List Clip TC', options: [], callback: async () => this.safeSend(() => this.od?.listClipTc?.()) },
      od_set_device_id: {
        name: 'OD Set Device ID (bytes)',
        options: [ { type: 'textinput', id: 'bytes', label: 'Device ID bytes (space/comma sep)', default: '0x00 0x01' } ],
        callback: async (e) => {
          const p = (v) => { const s = String(v).trim(); return s.startsWith('0x') ? parseInt(s, 16) : parseInt(s, 10) }
          const arr = String(e.options.bytes||'').split(/[ ,]+/).map((x)=>x.trim()).filter(Boolean).map(p)
          return this.safeSend(() => this.od?.setDeviceId?.(...arr))
        },
      },
      od_make_clip: {
        name: 'OD Make Clip (variant + data)',
        options: [
          { type: 'textinput', id: 'variant', label: 'cmd1 variant (hex 0xB0..0xBF)', default: '0xB0' },
          { type: 'textinput', id: 'data', label: 'data bytes', default: '' },
        ],
        callback: async (e) => {
          const p = (v) => { const s = String(v).trim(); return s.startsWith('0x') ? parseInt(s, 16) : parseInt(s, 10) }
          const v = p(e.options.variant)
          const arr = String(e.options.data||'').split(/[ ,]+/).map((x)=>x.trim()).filter(Boolean).map(p)
          return this.safeSend(() => this.od?.makeClip?.(v, ...arr))
        },
      },
      od_live: {
        name: 'OD Live (camera bytes)',
        options: [ { type: 'textinput', id: 'bytes', label: 'payload bytes', default: '' } ],
        callback: async (e) => {
          const p = (v) => { const s = String(v).trim(); return s.startsWith('0x') ? parseInt(s, 16) : parseInt(s, 10) }
          const arr = String(e.options.bytes||'').split(/[ ,]+/).map((x)=>x.trim()).filter(Boolean).map(p)
          return this.safeSend(() => this.od?.live?.(...arr))
        },
      },
      od_get_event: { name: 'OD Get Event', options: [], callback: async () => this.safeSend(() => this.od?.getEvent?.()) },
      
      // Odetics: Cue helpers (sony9pin-nodejs >= 0.6.3)
      od_cue_by_timecode: {
        name: 'OD Cue by Timecode',
        options: [
          { type: 'number', id: 'hh', label: 'HH', default: 1, min: 0, max: 23 },
          { type: 'number', id: 'mm', label: 'MM', default: 2, min: 0, max: 59 },
          { type: 'number', id: 'ss', label: 'SS', default: 3, min: 0, max: 59 },
          { type: 'number', id: 'ff', label: 'FF', default: 4, min: 0, max: 59 },
        ],
        callback: async (e) => this.safeSend(() => this.od?.cueByTimecode?.({ hh: e.options.hh|0, mm: e.options.mm|0, ss: e.options.ss|0, ff: e.options.ff|0 })),
      },
      od_load_and_cue_by_id: {
        name: 'OD Load and Cue by LSM ID',
        options: [ { type: 'textinput', id: 'lsm', label: 'LSM ID (e.g., 114A/00)', default: '114A/00' } ],
        callback: async (e) => this.safeSend(() => this.od?.loadAndCueById?.(String(e.options.lsm||''))),
      },
      od_load_by_id_and_cue_by_tc: {
        name: 'OD Load by ID and Cue by Timecode',
        options: [
          { type: 'textinput', id: 'lsm', label: 'LSM ID (e.g., 120C/12)', default: '120C/12' },
          { type: 'number', id: 'hh', label: 'HH', default: 1, min: 0, max: 23 },
          { type: 'number', id: 'mm', label: 'MM', default: 2, min: 0, max: 59 },
          { type: 'number', id: 'ss', label: 'SS', default: 3, min: 0, max: 59 },
          { type: 'number', id: 'ff', label: 'FF', default: 4, min: 0, max: 59 },
        ],
        callback: async (e) => this.safeSend(() => this.od?.loadByIdAndCueByTimecode?.(
          String(e.options.lsm||''),
          { hh: e.options.hh|0, mm: e.options.mm|0, ss: e.options.ss|0, ff: e.options.ff|0 }
        )),
      },
    }
  }

  getPresetDefinitions() {
    const styleBtn = (text, bg = 0x007700) => ({
      type: 'button',
      category: 'Transport',
      name: text,
      style: {
        text,
        size: 24,
        color: 0xffffff,
        bgcolor: bg,
      },
      steps: [
        {
          down: [],
          up: [],
        },
      ],
      feedbacks: [],
      actions: [],
    })

    return [
      {
        ...styleBtn('▶\nPLAY', 0x1e7f1e),
        steps: [ { down: [{ actionId: 'play' }], up: [] } ],
        feedbacks: [
          { feedbackId: 'status_flag', options: { flag: 'PLAY' }, style: { bgcolor: 0x00aa00 } },
          { feedbackId: 'connection_state', options: {}, style: { bgcolor: 0x550000 } },
        ],
      },
      {
        ...styleBtn('■\nSTOP', 0x7f1e1e),
        steps: [ { down: [{ actionId: 'stop' }], up: [] } ],
        feedbacks: [
          { feedbackId: 'status_flag', options: { flag: 'STOP' }, style: { bgcolor: 0xaa0000 } },
          { feedbackId: 'connection_state', options: {}, style: { bgcolor: 0x550000 } },
        ],
      },
      {
        ...styleBtn('⏪\nREW', 0x3a3a7f),
        steps: [ { down: [{ actionId: 'rew' }], up: [] } ],
        feedbacks: [
          { feedbackId: 'status_flag', options: { flag: 'REVERSE' }, style: { bgcolor: 0x3a7fff } },
          { feedbackId: 'connection_state', options: {}, style: { bgcolor: 0x550000 } },
        ],
      },
      {
        ...styleBtn('⏩\nFF', 0x3a3a7f),
        steps: [ { down: [{ actionId: 'ff' }], up: [] } ],
        feedbacks: [
          { feedbackId: 'status_flag', options: { flag: 'FORWARD' }, style: { bgcolor: 0x3a7fff } },
          { feedbackId: 'connection_state', options: {}, style: { bgcolor: 0x550000 } },
        ],
      },      
      {
        ...styleBtn('⏺\nREC', 0x9b0000),
        steps: [ { down: [{ actionId: 'record' }], up: [] } ],
        feedbacks: [
          { feedbackId: 'status_flag', options: { flag: 'RECORD' }, style: { bgcolor: 0xff0000 } },
          { feedbackId: 'connection_state', options: {}, style: { bgcolor: 0x550000 } },
        ],
      },
      {
        ...styleBtn('🎯\\n00:00', 0x9B8700),
        steps: [ { down: [{ actionId: 'cue_up_with_data', options: { hh: 0, mm: 0, ss: 0, ff: 0 } }], up: [] } ],
        feedbacks: [
          { feedbackId: 'connection_state', options: {}, style: { bgcolor: 0x550000 } },
        ],
      },
      {
        ...styleBtn('⏻\nSTBY\nON/OFF', 0x555555),
        steps: [ 
          { down: [{ actionId: 'standby_on' }], up: [] }, 
          { down: [{ actionId: 'standby_off' }], up: [] } 
        ],
        style: {
          size: 18,
          text: '⏻\\nSTBY\\nON/OFF',
        },
        feedbacks: [
          { feedbackId: 'status_flag', options: { flag: 'STANDBY' }, style: { bgcolor: 0x777777 } },
          { feedbackId: 'connection_state', options: {}, style: { bgcolor: 0x550000 } },
        ],
      },
      {
        ...styleBtn('▶/■\\nPLAY/STOP', 0x2e2e2e),
        steps: [
          { down: [{ actionId: 'play' }], up: [] },
          { down: [{ actionId: 'stop' }], up: [] },
        ],
        style: {
          size: 18,
          text: '▶/■\\nPLAY\nSTOP',
        },
        feedbacks: [
          { feedbackId: 'status_flag', options: { flag: 'PLAY' }, style: { bgcolor: 0x00aa00, color: 0xffffff } },
          { feedbackId: 'status_flag', options: { flag: 'STOP' }, style: { bgcolor: 0xaa0000, color: 0xffffff } },
          { feedbackId: 'connection_state', options: {}, style: { bgcolor: 0x550000 } },
        ],
      },
      
      // Timecode display presets
      {
        type: 'button',
        category: 'Timecode',
        name: 'TC Full',
        style: {
          text: '⏱\\n$(sony9pin-vtr:timecode_hh):$(sony9pin-vtr:timecode_mm)\\n$(sony9pin-vtr:timecode_ss).$(sony9pin-vtr:timecode_ff)',
          size: 18,
          color: 0xffffff,
          bgcolor: 0x333333,
        },
        steps: [ { down: [], up: [] } ],
        feedbacks: [ { feedbackId: 'connection_state', options: {}, style: { bgcolor: 0x550000 } } ],
      },
      
      // Blackmagic AMP presets
      {
        type: 'button',
        category: 'Blackmagic AMP',
        name: 'Loop Clip ON',
        style: { text: '⟲\\nLOOP\nCLIP', size: 18, color: 0xffffff, bgcolor: 0x444488 },
        steps: [ { down: [ { actionId: 'bm_set_playback_loop', options: { enable: true, timeline: false } } ], up: [] } ],
        feedbacks: [ { feedbackId: 'connection_state', options: {}, style: { bgcolor: 0x550000 } } ],
      },
      {
        type: 'button',
        category: 'Blackmagic AMP',
        name: 'Loop Timeline ON',
        style: { text: '⟲\\nLOOP\\nTL', size: 18, color: 0xffffff, bgcolor: 0x444488 },
        steps: [ { down: [ { actionId: 'bm_set_playback_loop', options: { enable: true, timeline: true } } ], up: [] } ],
        feedbacks: [ { feedbackId: 'connection_state', options: {}, style: { bgcolor: 0x550000 } } ],
      },
      {
        type: 'button',
        category: 'Blackmagic AMP',
        name: 'Loop OFF',
        style: { text: '⟲\\nLOOP\\nOFF', size: 18, color: 0xffffff, bgcolor: 0x444488 },
        steps: [ { down: [ { actionId: 'bm_set_playback_loop', options: { enable: false, timeline: false } } ], up: [] } ],
        feedbacks: [ { feedbackId: 'connection_state', options: {}, style: { bgcolor: 0x550000 } } ],
      },
      {
        type: 'button',
        category: 'Blackmagic AMP',
        name: 'Stop=Freeze Last',
        style: { text: '🧊\\nFREEZE\\nLAST', size: 16, color: 0xffffff, bgcolor: 0x884444 },
        steps: [ { down: [ { actionId: 'bm_set_stop_mode', options: { mode: 1 } } ], up: [] } ],
        feedbacks: [ { feedbackId: 'connection_state', options: {}, style: { bgcolor: 0x550000 } } ],
      },
      {
        type: 'button',
        category: 'Blackmagic AMP',
        name: 'Skip +1 Clip',
        style: { text: '⏭\\n+1 CLIP', size: 18, color: 0xffffff, bgcolor: 0x446688 },
        steps: [ { down: [ { actionId: 'bm_auto_skip', options: { delta: 1 } } ], up: [] } ],
        feedbacks: [ { feedbackId: 'connection_state', options: {}, style: { bgcolor: 0x550000 } } ],
      },
      {
        type: 'button',
        category: 'Blackmagic AMP',
        name: 'Skip -1 Clip',
        style: { text: '⏮\\n-1 CLIP', size: 18, color: 0xffffff, bgcolor: 0x446688 },
        steps: [ { down: [ { actionId: 'bm_auto_skip', options: { delta: -1 } } ], up: [] } ],
        feedbacks: [ { feedbackId: 'connection_state', options: {}, style: { bgcolor: 0x550000 } } ],
      },
      {
        type: 'button',
        category: 'Blackmagic AMP',
        name: 'Seek 50%',
        style: { text: '🎯\\nSEEK\\n50%', size: 18, color: 0xffffff, bgcolor: 0x446644 },
        steps: [ { down: [ { actionId: 'bm_seek_timeline_pos', options: { pos: 0.5 } } ], up: [] } ],
        feedbacks: [ { feedbackId: 'connection_state', options: {}, style: { bgcolor: 0x550000 } } ],
      },
      {
        type: 'button',
        category: 'Blackmagic AMP',
        name: 'Clear Playlist',
        style: { text: '🧹\\nCLEAR\\nPL', size: 18, color: 0xffffff, bgcolor: 0x664466 },
        steps: [ { down: [ { actionId: 'bm_clear_playlist' } ], up: [] } ],
        feedbacks: [ { feedbackId: 'connection_state', options: {}, style: { bgcolor: 0x550000 } } ],
      },
      {
        type: 'button',
        category: 'Blackmagic AMP',
        name: 'List Next IDs',
        style: { text: '📄\\nNEXT 3', size: 18, color: 0xffffff, bgcolor: 0x666644 },
        steps: [ { down: [ { actionId: 'bm_list_next_id', options: { count: 3 } } ], up: [] } ],
        feedbacks: [ { feedbackId: 'connection_state', options: {}, style: { bgcolor: 0x550000 } } ],
      },
      {
        type: 'button',
        category: 'Blackmagic AMP',
        name: 'Append Preset Demo',
        style: { text: '➕\\nPRESET', size: 16, color: 0xffffff, bgcolor: 0x446666 },
        steps: [ { down: [ { actionId: 'bm_append_preset', options: { name: 'Demo', in_hh: 0, in_mm: 0, in_ss: 5, in_ff: 0, out_hh: 0, out_mm: 0, out_ss: 10, out_ff: 0 } } ], up: [] } ],
        feedbacks: [ { feedbackId: 'connection_state', options: {}, style: { bgcolor: 0x550000 } } ],
      },
      {
        type: 'button',
        category: 'Timecode',
        name: 'TC Hours',
        style: {
          text: '$(sony9pin-vtr:timecode_hh)',
          size: 'auto',
          color: 0xffffff,
          bgcolor: 0x333333,
        },
        steps: [ { down: [], up: [] } ],
        feedbacks: [ { feedbackId: 'connection_state', options: {}, style: { bgcolor: 0x550000 } } ],
      },
      {
        type: 'button',
        category: 'Timecode',
        name: 'TC Minutes',
        style: {
          text: '$(sony9pin-vtr:timecode_mm)',
          size: 'auto',
          color: 0xffffff,
          bgcolor: 0x333333,
        },
        steps: [ { down: [], up: [] } ],
        feedbacks: [ { feedbackId: 'connection_state', options: {}, style: { bgcolor: 0x550000 } } ],
      },
      {
        type: 'button',
        category: 'Timecode',
        name: 'TC Seconds',
        style: {
          text: '$(sony9pin-vtr:timecode_ss)',
          size: 'auto',
          color: 0xffffff,
          bgcolor: 0x333333,
        },
        steps: [ { down: [], up: [] } ],
        feedbacks: [ { feedbackId: 'connection_state', options: {}, style: { bgcolor: 0x550000 } } ],
      },
      {
        type: 'button',
        category: 'Timecode',
        name: 'TC Frames',
        style: {
          text: '$(sony9pin-vtr:timecode_ff)',
          size: 'auto',
          color: 0xffffff,
          bgcolor: 0x333333,
        },
        steps: [ { down: [], up: [] } ],
        feedbacks: [ { feedbackId: 'connection_state', options: {}, style: { bgcolor: 0x550000 } } ],
      },
      
      // Odetics presets
      {
        type: 'button',
        category: 'Odetics',
        name: 'Cue by TC',
        style: { text: '🎯\\nCUE TC', size: 18, color: 0xffffff, bgcolor: 0x446644 },
        steps: [ { down: [ { actionId: 'od_cue_by_timecode', options: { hh: 1, mm: 2, ss: 3, ff: 4 } } ], up: [] } ],
        feedbacks: [ { feedbackId: 'connection_state', options: {}, style: { bgcolor: 0x550000 } } ],
      },
      {
        type: 'button',
        category: 'Odetics',
        name: 'Load+Cue by ID',
        style: { text: '📄\\nLOAD +\\nCUE ID', size: 14, color: 0xffffff, bgcolor: 0x556655 },
        steps: [ { down: [ { actionId: 'od_load_and_cue_by_id', options: { lsm: '114A/00' } } ], up: [] } ],
        feedbacks: [ { feedbackId: 'connection_state', options: {}, style: { bgcolor: 0x550000 } } ],
      },
      {
        type: 'button',
        category: 'Odetics',
        name: 'Load ID + Cue TC',
        style: { text: '📄🎯\\nLOAD\\nID+TC', size: 18, color: 0xffffff, bgcolor: 0x665544 },
        steps: [ { down: [ { actionId: 'od_load_by_id_and_cue_by_tc', options: { lsm: '120C/12', hh: 1, mm: 2, ss: 3, ff: 4 } } ], up: [] } ],
        feedbacks: [ { feedbackId: 'connection_state', options: {}, style: { bgcolor: 0x550000 } } ],
      },
    ]
  }

  getFeedbackDefinitions() {
    return {
      status_flag: {
        name: 'Status flag present',
        type: 'boolean',
        defaultStyle: {},
        options: [ { type: 'textinput', id: 'flag', label: 'Flag string (e.g., PLAY, STOP, RECORD)', default: 'PLAY' } ],
        callback: (fb) => {
          const flag = String(fb.options.flag || '').toUpperCase()
          return this._statusFlagsSet?.has(flag) || false
        },
      },
      connection_state: {
        name: 'Instance not connected',
        type: 'boolean',
        defaultStyle: {},
        options: [],
        callback: () => this._connStatus !== InstanceStatus.Ok,
      },
    }
  }

  async initConnection() {
    // Cleanup existing
    if (this.vtr) {
      try { await this.vtr.close() } catch {}
      this.vtr = null
    }
    this.bm = null

    const { portPath = 'COM1', baudRate = 38400, dataBits = 8, parity = 'odd', stopBits = 1, debug = false } = this.config || {}

    try {
      this.vtr = new VTR422({ portPath, baudRate, dataBits, parity, stopBits, debug })
      this.bm = new BlackmagicAMP(this.vtr)
      this.od = new Odetics(this.vtr)

      this.vtr.on('ack', () => this.log('debug', 'ACK'))
      this.vtr.on('nak', (m) => this.log('warn', `NAK: ${m.reasons?.join(', ')}`))
      this.vtr.on('device_type', (m) => {
        this.setVariableValues({ device_type: `0x${(m.deviceType ?? 0).toString(16)}` })
      })
      this.vtr.on('status', (m) => {
        const flags = m.flags?.join(', ') || ''
        this.setVariableValues({ status_flags: flags })
        try {
          this._statusFlagsSet = new Set((m.flags || []).map((f) => String(f).toUpperCase()))
          this.checkFeedbacks?.('status_flag')
        } catch {}
      })
      this.vtr.on('timecode', (m) => {
        const tc = m.timecode
        if (tc) {
          const s = `${String(tc.hours).padStart(2, '0')}:${String(tc.minutes).padStart(2, '0')}:${String(tc.seconds).padStart(2, '0')}:${String(tc.frames).padStart(2, '0')}`
          const hh = s.slice(0, 2)
          const mm = s.slice(3, 5)
          const ss = s.slice(6, 8)
          const ff = s.slice(9, 11)
          this.setVariableValues({ timecode: s, timecode_hh: hh, timecode_mm: mm, timecode_ss: ss, timecode_ff: ff })
        }
      })

      // Reconnect on close/error if enabled
      const onClose = () => {
        this.updateStatus(InstanceStatus.Disconnected, 'Port closed')
        this.scheduleReconnect()
      }
      const onError = (err) => {
        this.log('error', `Serial error: ${err?.message || err}`)
        this.updateStatus(InstanceStatus.UnknownError, err?.message || 'Serial error')
        this.scheduleReconnect()
      }
      try {
        this.vtr.port?.on('close', onClose)
        this.vtr.port?.on('error', onError)
      } catch {}

      await this.vtr.open()
      this.updateStatus(InstanceStatus.Ok)

      // Kick off some initial queries
      await this.vtr.deviceType().catch(() => {})
      await this.vtr.statusSense(0, 10).catch(() => {})
      await this.vtr.currentTimeSense(CurrentTimeSenseFlag.AUTO).catch(() => {})

      // Start polling if enabled
      this.setupPolling()

    } catch (e) {
      this.updateStatus(InstanceStatus.ConnectionFailure, e?.message || 'Failed to open serial port')
      this.log('error', `Connection error: ${e?.stack || e}`)
      this.scheduleReconnect()
    }
  }

  setupPolling() {
    if (this.statusTimer) { clearInterval(this.statusTimer); this.statusTimer = null }
    if (this.timecodeTimer) { clearInterval(this.timecodeTimer); this.timecodeTimer = null }

    const cfg = this.config || {}
    if (cfg.pollStatus) {
      const interval = Math.max(50, Number(cfg.pollStatusIntervalMs || 500))
      this.statusTimer = setInterval(() => {
        if (this.vtr?.isOpen()) this.vtr.statusSense(0, 10).catch(() => {})
      }, interval)
    }
    if (cfg.pollTimecode) {
      const interval = Math.max(20, Number(cfg.pollTimecodeIntervalMs || 200))
      this.timecodeTimer = setInterval(() => {
        if (this.vtr?.isOpen()) this.vtr.currentTimeSense(CurrentTimeSenseFlag.AUTO).catch(() => {})
      }, interval)
    }
  }

  scheduleReconnect() {
    const cfg = this.config || {}
    if (!cfg.reconnect) return
    if (this.reconnectTimer) return

    const initial = Math.max(250, Number(cfg.reconnectInitialMs || 1000))
    const max = Math.max(initial, Number(cfg.reconnectMaxMs || 15000))
    this.reconnectDelay = this.reconnectDelay ? Math.min(max, this.reconnectDelay * 2) : initial
    this.log('info', `Reconnecting in ${this.reconnectDelay}ms`)
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null
      await this.initConnection()
    }, this.reconnectDelay)
  }

  async safeSend(fn) {
    if (!this.vtr || !this.vtr.isOpen()) {
      this.updateStatus(InstanceStatus.Disconnected, 'Serial not open')
      return
    }
    try {
      await fn()
    } catch (e) {
      this.log('error', `Send error: ${e?.message || e}`)
      this.updateStatus(InstanceStatus.UnknownError, e?.message || 'Error')
    }
  }
}

runEntrypoint(RS422VTRInstance, [])
