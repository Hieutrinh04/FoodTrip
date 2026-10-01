import { Component } from 'react'

export default class AppErrorBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (!this.state.failed) return this.props.children
    return <main className="mx-auto max-w-xl px-5 py-20" role="alert">
      <h1 className="text-3xl font-bold">Không tải được trang / Unable to display this page</h1>
      <p className="my-5 text-ink-muted">Hãy tải lại để thử lại. Không xóa dữ liệu đã lưu trên thiết bị. / Reload to try again. Your saved browser data will not be cleared.</p>
      <div className="flex gap-4"><button className="rounded-full bg-chili px-5 py-3 text-chili-ink" onClick={() => window.location.reload()}>Tải lại / Reload</button><a className="rounded-full border border-line-strong px-5 py-3" href="/">Trang chủ / Home</a></div>
    </main>
  }
}
