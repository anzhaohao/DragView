/**
 * DragView settings section, rendered natively in the DSH Settings
 * shell through the `settings.section` slot (the third-party plugin pattern,
 * same as dsh-better-sidebar). Persists through the plugin's own fenced
 * routes: GET/POST /file-drop/settings on the host webServer.
 */
import { createElement, useEffect, useState } from 'react'

interface DragFileConfig {
  mode: 'resolve' | 'copy'
  dropDir: string
}

const ROW: Record<string, string> = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '16px',
  padding: '12px 0',
  borderBottom: '1px solid var(--dsw-alias-border-l2, rgba(148,163,184,.18))',
}

const LABEL: Record<string, string> = {
  minWidth: '0',
  color: 'var(--dsw-alias-label-primary, #e2e8f0)',
  fontSize: '13px',
  fontWeight: '500',
  lineHeight: '1.5',
}

const HINT: Record<string, string> = {
  color: 'var(--dsw-alias-label-tertiary, #94a3b8)',
  fontSize: '12px',
  lineHeight: '1.5',
  margin: '2px 0 0',
}

const INPUT: Record<string, string> = {
  border: '1px solid var(--dsw-alias-border-l2, rgba(148,163,184,.28))',
  background: 'var(--dsw-alias-bg-layer-3, rgba(148,163,184,.08))',
  height: '34px',
  color: 'var(--dsw-alias-label-primary, #e2e8f0)',
  borderRadius: '8px',
  padding: '0 12px',
  fontSize: '13px',
  lineHeight: '1.5',
  boxSizing: 'border-box',
}

const SELECT: Record<string, string> = {
  ...INPUT,
  minWidth: '200px',
  cursor: 'pointer',
}

const SAVE: Record<string, string> = {
  border: '1px solid transparent',
  borderRadius: '8px',
  padding: '5px 16px',
  fontSize: '13px',
  lineHeight: '1.5',
  cursor: 'pointer',
  background: 'var(--dsw-alias-button-info-fill, #3964fe)',
  color: '#fff',
}

const STATUS: Record<string, string> = {
  fontSize: '12px',
  lineHeight: '1.5',
  margin: '8px 0 0',
}

export function DragFileSettingsSection(): JSX.Element {
  const [config, setConfig] = useState<DragFileConfig>({ mode: 'resolve', dropDir: '.drops' })
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/file-drop/settings')
      .then((response) => response.json())
      .then((result: { ok?: boolean; value?: Partial<DragFileConfig> }) => {
        if (!alive) return
        if (result.ok && result.value) setConfig((prev) => ({ ...prev, ...result.value }))
      })
      .catch(() => { /* keep defaults */ })
    return () => { alive = false }
  }, [])

  const save = async (): Promise<void> => {
    setSaving(true)
    setStatus(null)
    try {
      const response = await fetch('/file-drop/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      const result = await response.json() as { ok?: boolean; error?: { message?: string } }
      setStatus(result.ok
        ? { kind: 'ok', text: '已保存，重启 dsh web 后生效。' }
        : { kind: 'err', text: `保存失败：${result.error?.message ?? '未知错误'}` })
    } catch (error) {
      setStatus({ kind: 'err', text: `保存失败：${error instanceof Error ? error.message : String(error)}` })
    }
    setSaving(false)
  }

  return createElement('div', { style: { maxWidth: '640px' } as Record<string, string> },
    // 拖拽模式
    createElement('div', { style: ROW },
      createElement('div', { style: { minWidth: '0' } as Record<string, string> },
        createElement('label', { style: LABEL }, '拖拽模式'),
        createElement('p', { style: HINT }, 'resolve：只引用原始文件路径，不复制文件；copy：松手即把文件复制进工作区目录。'),
      ),
      createElement('select', {
        style: SELECT,
        value: config.mode,
        onChange: (event: { target: { value: string } }) => setConfig({ ...config, mode: event.target.value as DragFileConfig['mode'] }),
      },
      createElement('option', { value: 'resolve' }, 'resolve（仅引用路径）'),
      createElement('option', { value: 'copy' }, 'copy（复制到工作区）'),
      ),
    ),
    // 目标文件夹
    createElement('div', { style: ROW },
      createElement('div', { style: { minWidth: '0' } as Record<string, string> },
        createElement('label', { style: LABEL }, '复制目标文件夹'),
        createElement('p', { style: HINT }, 'copy 模式下，文件复制到工作区下的这个相对目录（默认 .drops）。'),
      ),
      createElement('input', {
        style: { ...INPUT, width: '200px' } as Record<string, string>,
        value: config.dropDir,
        placeholder: '.drops',
        onChange: (event: { target: { value: string } }) => setConfig({ ...config, dropDir: event.target.value }),
      }),
    ),
    // 保存
    createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 0 4px' } as Record<string, string> },
      createElement('button', { style: SAVE, disabled: saving, onClick: () => { void save() } }, saving ? '保存中…' : '保存'),
      status !== null
        ? createElement('span', {
          style: { ...STATUS, color: status.kind === 'ok' ? 'var(--dsw-alias-label-secondary, #94a3b8)' : 'var(--dsw-alias-label-error, #f87171)' } as Record<string, string>,
        }, status.text)
        : null,
    ),
  )
}
