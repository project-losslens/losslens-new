import { useState } from 'react'
import AppIcon from './AppIcon'
import { useI18n } from '../i18n'
import './PasswordInput.css'

export default function PasswordInput({ id, disabled, ...props }) {
  const [visible, setVisible] = useState(false)
  const { t } = useI18n()

  return (
    <div className="password-input">
      <input {...props} id={id} disabled={disabled} type={visible ? 'text' : 'password'} />
      <button
        type="button"
        disabled={disabled}
        aria-controls={id}
        aria-label={t(visible ? 'login.hidePassword' : 'login.showPassword')}
        onClick={() => setVisible(current => !current)}
      >
        <AppIcon name={visible ? 'eye-off' : 'eye'} size={20} />
      </button>
    </div>
  )
}
