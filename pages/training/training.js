/**
 * 训练页：题目展示 + 数字键盘 + 答案输入 + 提交。
 * 训练模式显示反馈等待继续；竞速模式不显示反馈自动下一题。
 * 训练中不显示计时（避免分散注意力）。
 */
const storage = require('../../utils/storage')
const training = require('../../utils/training')
const { getArithmeticModule } = require('../../utils/registry')
const { elapsedSince, now } = require('../../utils/timer')

Page({
  data: {
    module: '',
    mode: 'training',
    moduleTitle: '',
    question: null,
    questionText: '',
    isSignedAddSub: false,
    allowNegative: false,
    input: '',
    feedback: null,
    awaitingContinue: false,
    isSpeed: false,
    answeredCount: 0,
    questionCount: 0,
    displayIndex: 0,
    hasSession: false
  },

  // 非响应式内部状态
  active: null,
  questionStartMonotonic: 0,
  questionStartIso: '',
  timerHandle: null,

  onLoad() {
    const active = storage.activeSessionsRepo.getActiveSession()
    if (!active) {
      wx.showToast({ title: '没有进行中的训练', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
      return
    }
    this.active = active
    this._finished = false
    // 拦截返回（左上角返回键 / 侧滑）：放弃训练需二次确认。
    // 原「结束训练」按钮已移除——用户要提前离开就走这里。
    try {
      wx.enableAlertBeforeUnload({
        message: '训练还未完成，确定要放弃吗？已作答的题目不会计入统计。'
      })
    } catch (e) { /* 基础库过低时忽略，返回不拦截 */ }
    this.initFromActive()
    this.startQuestion()
  },

  onUnload() {
    this.stopTimer()
    // 非正常完成（中途返回且确认放弃）→ 丢弃本次作答，不计入统计
    if (this.active && !this._finished) {
      training.abandonSession(this.active)
      this.active = null
    }
    try { wx.disableAlertBeforeUnload() } catch (e) { /* ignore */ }
  },

  initFromActive() {
    const active = this.active
    const mod = getArithmeticModule(active.module)
    const question = training.currentQuestion(active)
    this.setData({
      module: active.module,
      mode: active.mode,
      moduleTitle: mod.meta.title,
      isSignedAddSub: active.module === 'signed-add-sub',
      allowNegative: active.module === 'signed-add-sub',
      isSpeed: active.mode === 'speed',
      answeredCount: active.answers.length,
      questionCount: active.questionCount,
      displayIndex: active.mode === 'speed'
        ? Math.min(active.currentQuestionIndex + 1, Math.max(active.questionCount, 1))
        : active.currentQuestionIndex + 1,
      hasSession: true,
      input: '',
      feedback: null,
      awaitingContinue: false
    })
    this.updateQuestion(question)
  },

  updateQuestion(question) {
    this.setData({
      question,
      questionText: question ? question.text : ''
    })
  },

  startQuestion() {
    this.stopTimer()
    this.questionStartMonotonic = now()
    this.questionStartIso = new Date().toISOString()
    // 不显示计时，仅内部记录起点
  },

  stopTimer() {
    if (this.timerHandle) {
      clearInterval(this.timerHandle)
      this.timerHandle = null
    }
  },

  // 键盘输入
  onKeyTap(e) {
    const key = e.currentTarget.dataset.key
    let input = this.data.input

    if (key === 'del') {
      input = input.slice(0, -1)
    } else if (key === 'clear') {
      input = ''
    } else if (key === '.') {
      if (!input.includes('.')) input += '.'
    } else if (key === 'neg') {
      if (input.startsWith('-')) input = input.slice(1)
      else input = '-' + input
    } else {
      input += key
    }
    this.setData({ input })
  },

  // 提交答案
  submit() {
    if (!this.active) return
    const input = this.data.input.trim()
    const elapsedMs = Math.max(1, elapsedSince(this.questionStartMonotonic))
    const startedAtIso = this.questionStartIso || new Date().toISOString()

    try {
      const settings = storage.settingsRepo.getSettings()
      const weakPatterns = this.active.module === 'five-divide-three'
        ? storage.weakPatternsRepo.listWeakPatterns('five-divide-three')
        : []

      const result = training.submitAnswer(this.active, input, elapsedMs, startedAtIso, {
        weakPatterns,
        weakConfig: settings.weakPattern
      })

      this.active = result.active

      if (result.isComplete) {
        // 正常完成：关闭返回拦截，避免跳结算页时误弹「放弃训练」
        this._finished = true
        try { wx.disableAlertBeforeUnload() } catch (e) { /* ignore */ }
        const finished = training.finishSession(result.active)
        // 触发薄弱点重算（仅五除三）
        if (finished.module === 'five-divide-three') {
          const cfg = storage.settingsRepo.getSettings()
          training.recomputeWeakPatterns('five-divide-three', cfg.weakPattern)
        }
        wx.redirectTo({ url: '/pages/result/result?sessionId=' + finished.id })
        return
      }

      if (result.active.mode === 'speed') {
        // 竞速模式：不显示反馈，自动下一题
        this.setData({
          input: '',
          feedback: null,
          answeredCount: result.active.answers.length,
          displayIndex: Math.min(result.active.currentQuestionIndex + 1, Math.max(result.active.questionCount, 1))
        })
        this.updateQuestion(training.currentQuestion(result.active))
        this.startQuestion()
      } else {
        // 训练模式：显示反馈，等待继续
        this.setData({
          feedback: result.check,
          awaitingContinue: true,
          answeredCount: result.active.answers.length
        })
      }
    } catch (err) {
      wx.showToast({ title: err.message || '提交失败', icon: 'none' })
    }
  },

  // 训练模式继续下一题
  continueNext() {
    if (!this.active) return
    this.setData({
      input: '',
      feedback: null,
      awaitingContinue: false
    })
    this.updateQuestion(training.currentQuestion(this.active))
    this.startQuestion()
  },

  /**
   * 重开：放弃当前这组题目，重新开一组（同模块 / 同模式 / 同题量）。
   * 旧的那组不计入统计，所以先确认一次。
   */
  restartSession() {
    if (!this.active) return
    wx.showModal({
      title: '重开一组',
      content: '当前这组题目会被放弃（不计入统计），确定重新开一组吗？',
      confirmText: '重开',
      cancelText: '取消',
      success: (res) => {
        if (!res.confirm || !this.active) return
        try {
          const prev = this.active
          const settings = storage.settingsRepo.getSettings()
          const weakPatterns = prev.module === 'five-divide-three'
            ? storage.weakPatternsRepo.listWeakPatterns('five-divide-three')
            : []
          // 先放弃旧的，再开新的（同一时刻只应存在一个进行中的会话）
          training.abandonSession(prev)
          this.active = training.beginSession({
            module: prev.module,
            mode: prev.mode,
            questionCount: prev.questionCount,
            allowedErrorRate: prev.allowedErrorRate !== undefined ? prev.allowedErrorRate : settings.defaultAllowedErrorRate,
            weakPatterns,
            weakConfig: settings.weakPattern
          })
          this.setData({ input: '', feedback: null, awaitingContinue: false })
          this.initFromActive()
          this.startQuestion()
          wx.showToast({ title: '已重新开一组', icon: 'none' })
        } catch (err) {
          wx.showToast({ title: err.message || '重开失败', icon: 'none' })
        }
      }
    })
  },

  feedbackCorrect() {
    return this.data.feedback && this.data.feedback.correct
  }
})
