import { useLocation, useNavigate } from 'react-router-dom'
import { Icon } from './Icon'
import './backbutton.css'

/** Back to wherever you came from in Konomi; from a shared link (no history here yet), back to the start. */
export function BackButton() {
  const nav = useNavigate()
  const inApp = useLocation().key !== 'default'
  return (
    <button type="button" className="back-btn" onClick={() => (inApp ? nav(-1) : nav('/'))}>
      <Icon name="arrowLeft" size={18} /> {inApp ? 'Back' : 'Konomi home'}
    </button>
  )
}
