import { useEffect, useRef, useState } from 'react'

function precisionForStep(step) {
  const text = String(step)
  return text.includes('.') ? text.length - text.indexOf('.') - 1 : 0
}

export default function NumberField({
  value,
  onChange,
  min,
  max,
  step = 1,
  prefix,
  suffix,
  inputMode = 'decimal',
  style,
  wrapperStyle,
  className = '',
  onInvalid,
  ...inputProps
}) {
  const [raw, setRaw] = useState(value == null ? '' : String(value))
  const [invalid, setInvalid] = useState(false)
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setRaw(value == null ? '' : String(value))
  }, [value])

  const commit = () => {
    focused.current = false
    const trimmed = raw.trim()
    if (!trimmed) {
      setInvalid(false)
      onChange(null)
      return
    }

    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) {
      setInvalid(true)
      onInvalid?.()
      return
    }

    const numericValue = Number(trimmed)
    if (!Number.isFinite(numericValue)) {
      setInvalid(true)
      onInvalid?.()
      return
    }

    const safeStep = Number.isFinite(step) && step > 0 ? step : 1
    const base = Number.isFinite(min) ? min : 0
    const steppedValue = base + Math.round((numericValue - base) / safeStep) * safeStep
    const boundedValue = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, steppedValue))
    const normalized = Number(boundedValue.toFixed(precisionForStep(safeStep)))
    setInvalid(false)
    setRaw(String(normalized))
    onChange(normalized)
  }

  return (
    <span className={`number-field${prefix ? ' number-field--prefix' : ''}${suffix ? ' number-field--suffix' : ''}`} style={wrapperStyle}>
      {prefix && <span className="number-field__affix" aria-hidden="true">{prefix}</span>}
      <input
        {...inputProps}
        type="text"
        inputMode={inputMode}
        style={style}
        value={raw}
        onFocus={() => { focused.current = true }}
        onChange={(event) => {
          setRaw(event.target.value)
          setInvalid(false)
        }}
        onBlur={(event) => {
          commit()
          inputProps.onBlur?.(event)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
          inputProps.onKeyDown?.(event)
        }}
        aria-invalid={invalid || inputProps['aria-invalid'] || undefined}
        className={`number-field__input${className ? ` ${className}` : ''}`}
      />
      {suffix && <span className="number-field__affix" aria-hidden="true">{suffix}</span>}
    </span>
  )
}
