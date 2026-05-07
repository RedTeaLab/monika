function PermissionsTab() {
  return (
    <div>
      <h3 className="text-[15px] font-semibold m-0 mb-1">Permissions</h3>
      <p className="text-[11px] text-[var(--text-dim)] m-0 mb-4">管理工具执行权限和审批规则</p>
      <div className="flex flex-col items-center justify-center h-48 text-[var(--text-dim)]">
        <span className="text-[24px] mb-2">🔒</span>
        <span className="text-[13px]">规则编辑器将在后端 RPC 就绪后可用</span>
        <span className="text-[11px] mt-1">当前权限规则通过 ConfirmBar 的"始终允许"按钮自动添加</span>
      </div>
    </div>
  )
}

export default PermissionsTab
