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
    this.initFromActive()
    this.startQuestion()
  },

  onUnload() {
    this.stopTimer()
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

  // 重开本题
  restartQuestion() {
    this.setData({ input: '' })
    this.startQuestion()
  },

  // 结束训练
  endTraining() {
    if (!this.active) return
    wx.showModal({
      title: '结束训练',
      content: '确定要结束本次训练吗？已作答的题目会计入统计。',
      confirmText: '结束',
      cancelText: '继续练',
      success: (res) => {
        if (!res.confirm) return
        if (this.active.answers.length === 0) {
          training.abandonSession(this.active)
          wx.navigateBack()
        } else {
          const finished = training.finishSession(this.active)
          if (finished.module === 'five-divide-three') {
            const cfg = storage.settingsRepo.getSettings()
            training.recomputeWeakPatterns('five-divide-three', cfg.weakPattern)
          }
          wx.redirectTo({ url: '/pages/result/result?sessionId=' + finished.id })
        }
      }
    })
  },

  feedbackCorrect() {
    return this.data.feedback && this.data.feedback.correct
  }
})
