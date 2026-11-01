import { AnimatePresence, motion } from 'motion/react'
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import './toast.css'

interface ToastItem {
  id: number
  /** Shown in bold above the text, e.g. the anime it is about. */
  title?: string
  text: string
  action?: { label: string; run: () => void }
  /** Extra buttons, shown before `action`. */
  actions?: { label: string; run: () => void }[]
}

const Ctx = createContext<(t: Omit<ToastItem, 'id'>) => void>(() => undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const seq = useRef(0)
  const push = useCallback((t: Omit<ToastItem, 'id'>) => {
    const id = ++seq.current
    setItems((xs) => [...xs.slice(-2), { ...t, id }])
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4500)
  }, [])
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div key={t.id} className="toast" layout initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
              transition={{ type: 'spring', stiffness: 500, damping: 34 }}>
              <span className="toast-text">{t.title && <strong>{t.title}</strong>}<span>{t.text}</span></span>
              {[...(t.actions ?? []), ...(t.action ? [t.action] : [])].length > 0 && (
                <span className="toast-actions">
                  {[...(t.actions ?? []), ...(t.action ? [t.action] : [])].map((a) => (
                    <button key={a.label} className="toast-action" onClick={() => {
                      a.run()
                      setItems((xs) => xs.filter((x) => x.id !== t.id))
                    }}>{a.label}</button>
                  ))}
                </span>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)
