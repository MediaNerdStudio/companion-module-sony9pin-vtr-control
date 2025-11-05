import { InstanceBase, runEntrypoint, InstanceStatus } from '@companion-module/base'
import { VTR422, CurrentTimeSenseFlag, BlackmagicAMP, Encoder } from 'sony9pin-nodejs'

class RS422VTRInstance extends InstanceBase {
  constructor(internal) {
    super(internal)
    this.vtr = null
    this.bm = null
    this.config = {}
    this.statusTimer = null
    this.timecodeTimer = null
    this.reconnectTimer = null
    this.reconnectDelay = 0
  }

  async init(config) {
    this.config = config
    this.updateStatus(InstanceStatus.Disconnected)

    this.setActionDefinitions(this.getActionDefinitions())
    this.setVariableDefinitions(this.getVariableDefinitions())
    this.setPresetDefinitions(this.getPresetDefinitions())
    this.setFeedbackDefinitions(this.getFeedbackDefinitions())

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
    }
  }

  getPresetDefinitions() {
    const styleBtn = (text, bg = 0x007700) => ({
      type: 'button',
      category: 'Transport',
      name: text,
      style: {
        text,
        size: 'auto',
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
        ...styleBtn('PLAY', 0x1e7f1e),
        actions: [{ actionId: 'play' }],
        feedbacks: [{ feedbackId: 'status_flag', options: { flag: 'PLAY' }, style: { bgcolor: 0x00aa00 } }],
      },
      {
        ...styleBtn('STOP', 0x7f1e1e),
        actions: [{ actionId: 'stop' }],
        feedbacks: [{ feedbackId: 'status_flag', options: { flag: 'STOP' }, style: { bgcolor: 0xaa0000 } }],
      },
      {
        ...styleBtn('FF >>', 0x3a3a7f),
        actions: [{ actionId: 'ff' }],
        feedbacks: [{ feedbackId: 'status_flag', options: { flag: 'SHUTTLE' }, style: { bgcolor: 0x3a7fff } }],
      },
      {
        ...styleBtn('<< REW', 0x3a3a7f),
        actions: [{ actionId: 'rew' }],
        feedbacks: [{ feedbackId: 'status_flag', options: { flag: 'SHUTTLE' }, style: { bgcolor: 0x3a7fff } }],
      },
      {
        ...styleBtn('RECORD', 0x9b0000),
        actions: [{ actionId: 'record' }],
        feedbacks: [{ feedbackId: 'status_flag', options: { flag: 'RECORD' }, style: { bgcolor: 0xff0000 } }],
      },
      {
        ...styleBtn('STANDBY ON', 0x555555),
        actions: [{ actionId: 'standby_on' }],
        feedbacks: [{ feedbackId: 'status_flag', options: { flag: 'STANDBY' }, style: { bgcolor: 0x777777 } }],
      },
      {
        ...styleBtn('STANDBY OFF', 0x555555),
        actions: [{ actionId: 'standby_off' }],
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
          const flags = (this?.getVariableValue?.('status_flags') || '').toUpperCase()
          return flags.includes(flag)
        },
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

      this.vtr.on('ack', () => this.log('debug', 'ACK'))
      this.vtr.on('nak', (m) => this.log('warn', `NAK: ${m.reasons?.join(', ')}`))
      this.vtr.on('device_type', (m) => {
        this.setVariableValues({ device_type: `0x${(m.deviceType ?? 0).toString(16)}` })
      })
      this.vtr.on('status', (m) => {
        const flags = m.flags?.join(', ') || ''
        this.setVariableValues({ status_flags: flags })
      })
      this.vtr.on('timecode', (m) => {
        const tc = m.timecode
        if (tc) {
          const s = `${String(tc.hours).padStart(2, '0')}:${String(tc.minutes).padStart(2, '0')}:${String(tc.seconds).padStart(2, '0')}:${String(tc.frames).padStart(2, '0')}`
          this.setVariableValues({ timecode: s })
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
