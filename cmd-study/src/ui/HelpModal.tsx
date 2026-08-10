import { X } from 'lucide-react'

interface HelpModalProps {
  onClose: () => void
  onResetAll: () => void
}

export default function HelpModal({ onClose, onResetAll }: HelpModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose} data-testid="help-modal">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>帮助</h2>
          <button className="icon-btn" onClick={onClose} data-testid="help-close">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          <section>
            <h3>键盘快捷键</h3>
            <table className="help-table">
              <tbody>
                <tr><td>Enter</td><td>执行命令</td></tr>
                <tr><td>↑ / ↓</td><td>浏览命令历史</td></tr>
                <tr><td>Tab</td><td>补全命令 / 路径</td></tr>
                <tr><td>Ctrl+L</td><td>清屏</td></tr>
                <tr><td>Ctrl+C</td><td>取消当前输入</td></tr>
              </tbody>
            </table>
          </section>
          <section>
            <h3>支持的命令</h3>
            <p>
              Linux：pwd ls cd mkdir touch cp mv rm cat head tail echo grep find wc sort uniq chmod whoami id ps kill history clear man help
            </p>
            <p>
              Docker：version info images pull ps run start stop restart rm rmi logs exec inspect network ls volume ls
            </p>
            <p>
              Kubernetes：version cluster-info get describe logs create apply expose scale set image rollout delete
            </p>
            <p>管道 | 重定向 &gt; &gt;&gt; &lt; heredoc &lt;&lt;EOF</p>
          </section>
          <section>
            <h3>关于</h3>
            <p className="help-note">
              这是一个纯浏览器端的安全模拟器：所有文件系统、容器、Pod 状态都保存在内存与 localStorage 中，
              不会执行任何真实系统命令，也不会访问你的真实文件。
            </p>
          </section>
          <button className="btn btn-danger" onClick={onResetAll} data-testid="reset-all-btn">
            重置所有学习进度
          </button>
        </div>
      </div>
    </div>
  )
}
