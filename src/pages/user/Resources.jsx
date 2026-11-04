import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import '../../styles/globals.css'
import Sidebar from '../../components/Sidebar'

// ✅ Constants
const CATEGORY_ICONS = {
  Crisis: '🆘', Professional: '👨‍⚕️', 'Self-Exclusion': '🚫',
  'Financial Recovery': '💰', International: '🌍', Apps: '📱',
  Podcasts: '🎙️', 'Blocking Tools': '🛡️', Mindfulness: '🧘', Other: '📌',
}
const ALL_CATEGORIES = Object.keys(CATEGORY_ICONS)

const DAILY_AFFIRMATIONS = [
  { text: "Every day you choose not to gamble is a victory.", day: 0 },
  { text: "You are stronger than your urges. They pass — you remain.", day: 1 },
  { text: "Progress, not perfection. Every step counts.", day: 2 },
  { text: "Your worth is not measured by wins or losses.", day: 3 },
  { text: "You've survived every difficult day so far. Keep going.", day: 4 },
  { text: "Small wins build big changes. Celebrate them all.", day: 5 },
  { text: "Rest is part of recovery. Be kind to yourself today.", day: 6 },
]

const EMERGENCY_CONTACTS = [
  { name: 'NACADA Helpline', number: '1192', desc: 'Free, confidential. 24/7.' },
  { name: 'Befrienders Kenya', number: '+254 722 178 177', desc: 'Emotional support 24/7.' },
]

function showToast(message, duration = 3000) {
  const toast = document.createElement('div')
  toast.textContent = message
  toast.style.cssText = `position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:#1d5c38;color:#6ee7b7;padding:10px 20px;border-radius:100px;font-size:13px;z-index:3000;box-shadow:0 4px 16px rgba(0,0,0,0.4);border:1px solid #3b7a5a;white-space:nowrap`
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), duration)
}

export default function Resources() {
  const navigate = useNavigate()
  const [resources, setResources] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [savedIds, setSavedIds] = useState([])
  const [recentlyViewed, setRecentlyViewed] = useState([])
  const [showSuggestionForm, setShowSuggestionForm] = useState(false)
  const [suggestion, setSuggestion] = useState({ name: '', link: '', category: 'Crisis', notes: '' })
  const [suggestionSent, setSuggestionSent] = useState(false)
  const [submittingSuggestion, setSubmittingSuggestion] = useState(false)
  const [ratings, setRatings] = useState({})
  const [profile, setProfile] = useState(null)
  const [sessionExpired, setSessionExpired] = useState(false)

  const affirmation = useMemo(() => DAILY_AFFIRMATIONS[new Date().getDay()], [])

  useEffect(() => { fetchResources(); loadSaved(); loadRecent(); fetchProfile() }, [])

  // ✅ Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const fetchProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setSessionExpired(true); return }
    try {
      const { data } = await supabase.from('profiles').select('streak_days, risk_level').eq('id', session.user.id).single()
      setProfile(data)
    } catch (err) { console.error('Profile fetch error:', err) }
  }

  const fetchResources = async () => {
    try {
      setLoading(true)
      const { data, error: fetchError } = await supabase.from('resources').select('*').eq('active', true).order('category').order('name')
      if (fetchError) throw fetchError
      setResources(data || [])
    } catch (err) {
      console.error('Resources fetch error:', err)
      setError('Failed to load resources.')
    } finally { setLoading(false) }
  }

  const loadSaved = () => {
    try {
      const saved = localStorage.getItem('precious_saved_resources')
      if (saved) setSavedIds(JSON.parse(saved))
    } catch {}
  }

  const loadRecent = () => {
    try {
      const recent = localStorage.getItem('precious_recent_resources')
      if (recent) setRecentlyViewed(JSON.parse(recent))
    } catch {}
  }

  const toggleSave = (id) => {
    const updated = savedIds.includes(id) ? savedIds.filter(s => s !== id) : [...savedIds, id]
    setSavedIds(updated)
    try { localStorage.setItem('precious_saved_resources', JSON.stringify(updated)) } catch {}
  }

  const markViewed = (resource) => {
    const updated = [resource, ...recentlyViewed.filter(r => r.id !== resource.id)].slice(0, 5)
    setRecentlyViewed(updated)
    try { localStorage.setItem('precious_recent_resources', JSON.stringify(updated)) } catch {}
  }

  // ✅ Open with noopener for security
  const handleVisit = (resource) => {
    markViewed(resource)
    if (resource.link) {
      const newWindow = window.open(resource.link, '_blank', 'noopener,noreferrer')
      if (newWindow) newWindow.opener = null
    }
  }

  const handleRate = async (resourceId, helpful) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const key = `${resourceId}-${helpful}`
    if (ratings[key]) return

    try {
      await supabase.from('resource_ratings').upsert(
        { user_id: session.user.id, resource_id: resourceId, helpful },
        { onConflict: 'user_id,resource_id' }
      )
      setRatings(prev => ({ ...prev, [key]: true }))
      setResources(prev => prev.map(r => r.id === resourceId ? { ...r, [helpful ? 'helpful_count' : 'not_helpful_count']: (r[helpful ? 'helpful_count' : 'not_helpful_count'] || 0) + 1 } : r))
    } catch (err) { console.error('Rating error:', err) }
  }

  const handleShare = async (resource) => {
    const text = `${resource.name}: ${resource.detail || ''}\n${resource.link || ''}`
    try {
      if (navigator.share && navigator.canShare?.({ text })) {
        await navigator.share({ title: resource.name, text })
      } else {
        await navigator.clipboard.writeText(text)
        showToast('📋 Copied!')
      }
    } catch {
      try { await navigator.clipboard.writeText(text); showToast('📋 Copied!') }
      catch { showToast('Could not copy.', 2000) }
    }
  }

  const submitSuggestion = async () => {
    if (!suggestion.name.trim()) return
    setSubmittingSuggestion(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await supabase.from('resource_suggestions').insert({
        ...suggestion,
        user_id: session?.user?.id,
        category: suggestion.category || 'Crisis',
      })
      setSuggestionSent(true)
      showToast('✅ Suggestion submitted!')
      setTimeout(() => { setShowSuggestionForm(false); setSuggestionSent(false); setSuggestion({ name: '', link: '', category: 'Crisis', notes: '' }) }, 1500)
    } catch (err) { showToast('Failed to submit.', 2000) }
    setSubmittingSuggestion(false)
  }

  // ✅ Check actual hours field
  const isOpenNow = (resource) => {
    const hours = resource.hours || resource.detail || ''
    if (hours.toLowerCase().includes('24/7')) return true
    const now = new Date()
    const kenyaHour = now.getUTCHours() + 3
    const day = now.getDay()
    if (hours.toLowerCase().includes('mon-fri') && day >= 1 && day <= 5 && kenyaHour >= 8 && kenyaHour < 17) return true
    if (hours.toLowerCase().includes('8am-5pm') && kenyaHour >= 8 && kenyaHour < 17) return true
    return false
  }

  const getRecommendedCategories = () => {
    if (!profile) return ['Crisis', 'Professional']
    if (profile.streak_days < 7) return ['Crisis', 'Self-Exclusion']
    if (profile.streak_days < 30) return ['Professional', 'Apps', 'Mindfulness']
    return ['Financial Recovery', 'Podcasts', 'Mindfulness']
  }

  // ✅ Memoized filtered + grouped + topRated
  const { filteredResources, grouped, topRated } = useMemo(() => {
    const filtered = resources.filter(r => {
      const matchesSearch = !debouncedSearch || r.name?.toLowerCase().includes(debouncedSearch.toLowerCase()) || r.detail?.toLowerCase().includes(debouncedSearch.toLowerCase())
      const matchesCategory = activeCategory === 'all' || r.category === activeCategory
      return matchesSearch && matchesCategory
    })

    const groupedData = filtered.reduce((acc, r) => {
      const cat = r.category || 'Other'
      if (!acc[cat]) acc[cat] = []
      acc[cat].push(r)
      return acc
    }, {})

    const top = [...resources].sort((a, b) => (b.helpful_count || 0) - (a.helpful_count || 0)).slice(0, 3)

    return { filteredResources: filtered, grouped: groupedData, topRated: top }
  }, [resources, debouncedSearch, activeCategory])

  const recommendedCats = useMemo(() => getRecommendedCategories(), [profile])
  const savedResources = useMemo(() => resources.filter(r => savedIds.includes(r.id)), [resources, savedIds])

  if (sessionExpired) {
    return (
      <div style={{ minHeight: '100vh', background: '#041f13', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ textAlign: 'center', maxWidth: '320px' }}>
          <span style={{ fontSize: '56px', display: 'block', marginBottom: '16px' }}>🔒</span>
          <h2 style={{ color: '#f59e0b', fontFamily: "'Playfair Display', serif" }}>Please log in</h2>
          <button onClick={() => navigate('/login', { replace: true })} style={{ padding: '14px 32px', borderRadius: '100px', background: '#f59e0b', border: 'none', color: '#041f13', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif", width: '100%', marginTop: '16px' }}>Go to Login →</button>
        </div>
      </div>
    )
  }

  return (
    <div className="root" style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, marginLeft: '48px', minWidth: 0 }} className="main-content">

        {/* Crisis Banner */}
        <div style={{ background: '#791F1F', color: '#F09595', padding: '10px 1.5rem', fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 101, flexWrap: 'wrap', gap: '4px' }}>
          <span>🆘 In crisis? Call <a href={`tel:${EMERGENCY_CONTACTS[0].number}`} style={{ color: '#FAC775', fontWeight: 700, textDecoration: 'none' }}>{EMERGENCY_CONTACTS[0].name} {EMERGENCY_CONTACTS[0].number}</a> — free, 24/7</span>
          <span style={{ fontSize: '11px', opacity: 0.7 }}>You're not alone</span>
        </div>

        <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', background: '#041f13', borderBottom: '1px solid #0a3d22' }}>
          <div><h1 style={{ fontSize: '18px', fontWeight: 600, color: '#fff', fontFamily: "'Inter', sans-serif", margin: 0 }}>📞 Resources</h1><p style={{ fontSize: '12px', color: '#3b7a5a', margin: '2px 0 0' }}>{resources.length} resources available</p></div>
        </nav>

        <div style={{ padding: '1.5rem' }}>
          {/* Daily Affirmation */}
          <div style={{ background: 'linear-gradient(135deg, #0a3d22, #1d5c38)', border: '1px solid #f59e0b', borderRadius: '12px', padding: '14px 16px', marginBottom: '1rem', textAlign: 'center' }}>
            <p style={{ color: '#f59e0b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>🌟 Daily Affirmation</p>
            <p style={{ color: '#6ee7b7', fontSize: '14px', fontStyle: 'italic', margin: 0, lineHeight: '1.6' }}>"{affirmation.text}"</p>
          </div>

          {/* Recently Viewed */}
          {recentlyViewed.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <p style={{ color: '#3b7a5a', fontSize: '11px', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>Recently viewed</p>
              <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                {recentlyViewed.map(r => (
                  <button key={r.id} onClick={() => handleVisit(r)} style={{ padding: '6px 12px', borderRadius: '100px', background: '#0a3d22', border: '1px solid #1d5c38', color: '#6ee7b7', fontSize: '11px', whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: "'Inter', sans-serif", flexShrink: 0 }}>{CATEGORY_ICONS[r.category] || '📌'} {r.name}</button>
                ))}
              </div>
            </div>
          )}

          {/* Recommended */}
          {recommendedCats.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <p style={{ color: '#3b7a5a', fontSize: '11px', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>Recommended for you</p>
              <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                {recommendedCats.map(cat => (
                  <button key={cat} onClick={() => setActiveCategory(cat)} style={{ padding: '6px 12px', borderRadius: '100px', background: '#0a3d22', border: '1px solid #f59e0b', color: '#f59e0b', fontSize: '11px', whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: "'Inter', sans-serif", flexShrink: 0 }}>{CATEGORY_ICONS[cat] || '📌'} {cat}</button>
                ))}
              </div>
            </div>
          )}

          {/* Search */}
          <div style={{ position: 'relative', marginBottom: '1rem' }}>
            <input type="text" placeholder="🔍 Search resources..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '10px 40px 10px 14px', borderRadius: '100px', background: '#062616', border: '1px solid #0a3d22', color: '#fff', fontSize: '13px', outline: 'none', fontFamily: "'Inter', sans-serif", boxSizing: 'border-box' }} />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#3b7a5a', fontSize: '16px', cursor: 'pointer', padding: '4px 8px' }} aria-label="Clear search">✕</button>
            )}
          </div>

          {/* Category Tabs */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '1rem', overflowX: 'auto', paddingBottom: '4px', WebkitOverflowScrolling: 'touch' }}>
            <button onClick={() => setActiveCategory('all')} style={{ padding: '6px 14px', borderRadius: '100px', border: `1px solid ${activeCategory === 'all' ? '#1d5c38' : '#0a3d22'}`, background: activeCategory === 'all' ? '#0a3d22' : 'transparent', color: activeCategory === 'all' ? '#f59e0b' : '#6ee7b7', fontSize: '12px', fontWeight: activeCategory === 'all' ? 600 : 400, cursor: 'pointer', fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap' }}>All</button>
            {ALL_CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setActiveCategory(cat)} style={{ padding: '6px 14px', borderRadius: '100px', border: `1px solid ${activeCategory === cat ? '#1d5c38' : '#0a3d22'}`, background: activeCategory === cat ? '#0a3d22' : 'transparent', color: activeCategory === cat ? '#f59e0b' : '#6ee7b7', fontSize: '12px', fontWeight: activeCategory === cat ? 600 : 400, cursor: 'pointer', fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap' }}>{CATEGORY_ICONS[cat]} {cat}</button>
            ))}
          </div>

          {/* Top Rated */}
          {topRated.length > 0 && activeCategory === 'all' && !debouncedSearch && (
            <div style={{ marginBottom: '1rem' }}>
              <p style={{ color: '#f59e0b', fontSize: '11px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>⭐ Most helpful</p>
              {topRated.map(r => (
                <div key={r.id} style={{ padding: '12px', background: '#0a3d22', borderRadius: '10px', marginBottom: '6px', border: '1px solid #1d5c38', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '24px' }}>{CATEGORY_ICONS[r.category] || '📌'}</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: '#e2f5ec', fontSize: '13px', fontWeight: 500, margin: 0 }}>{r.name}</p>
                    <p style={{ color: '#6ee7b7', fontSize: '11px', margin: '2px 0' }}>{r.detail}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => handleRate(r.id, true)} style={{ background: 'transparent', border: 'none', fontSize: '14px', cursor: 'pointer', padding: '4px' }} title="Helpful">👍</button>
                    <button onClick={() => handleVisit(r)} style={{ padding: '6px 12px', borderRadius: '100px', background: '#f59e0b', border: 'none', color: '#041f13', fontSize: '11px', fontWeight: 500, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>{r.link ? 'Visit' : 'View'}</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Main Content */}
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[1,2,3].map(i => <div key={i} style={{ background: '#062616', borderRadius: '10px', padding: '16px', animation: 'pulse 1.5s infinite', height: '60px', opacity: 0.3 }} />)}
            </div>
          ) : error ? (
            <div className="dash-section" style={{ textAlign: 'center', padding: '2rem' }}><p style={{ color: '#F09595' }}>{error}</p><button className="btn-ghost" onClick={fetchResources}>Retry</button></div>
          ) : filteredResources.length === 0 ? (
            <div className="dash-section" style={{ textAlign: 'center', padding: '2rem' }}>
              <span style={{ fontSize: '40px', display: 'block', marginBottom: '12px' }}>📞</span>
              <p style={{ color: '#6ee7b7', fontSize: '14px' }}>{debouncedSearch || activeCategory !== 'all' ? 'No resources match your search.' : 'No resources yet.'}</p>
              {(debouncedSearch || activeCategory !== 'all') && <button onClick={() => { setSearchQuery(''); setActiveCategory('all') }} style={{ marginTop: '10px', padding: '8px 16px', borderRadius: '100px', background: 'transparent', border: '1px solid #6ee7b7', color: '#6ee7b7', fontSize: '12px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Clear filters</button>}
            </div>
          ) : (
            Object.entries(grouped).map(([category, items]) => (
              <div key={category} className="dash-section" style={{ marginBottom: '1rem' }}>
                <h3 style={{ color: '#f59e0b', fontSize: '13px', marginBottom: '1rem' }}>{CATEGORY_ICONS[category] || '📌'} {category}</h3>
                {items.map(r => (
                  <div key={r.id} style={{ padding: '10px 0', borderBottom: '1px solid #0a3d22', display: 'flex', alignItems: 'center', gap: '10px', transition: 'background 0.15s', borderRadius: '8px', paddingLeft: '8px', paddingRight: '8px' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#041f13'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                        <p style={{ color: '#e2f5ec', fontSize: '13px', fontWeight: 500, margin: 0 }}>{r.name}</p>
                        {isOpenNow(r) ? <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3db88a', flexShrink: 0 }} title="Open now" /> : <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3b7a5a', flexShrink: 0 }} title="May be closed" />}
                      </div>
                      <p style={{ color: '#3b7a5a', fontSize: '12px', margin: '2px 0 0', lineHeight: '1.4' }}>{r.detail}</p>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
                      <button onClick={() => handleRate(r.id, true)} style={{ background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer', padding: '4px' }} title="Helpful">👍</button>
                      <button onClick={() => toggleSave(r.id)} style={{ background: 'transparent', border: 'none', fontSize: '13px', cursor: 'pointer', padding: '4px', color: savedIds.includes(r.id) ? '#f59e0b' : '#3b7a5a' }} title={savedIds.includes(r.id) ? 'Saved' : 'Save'}>{savedIds.includes(r.id) ? '⭐' : '☆'}</button>
                      <button onClick={() => handleShare(r)} style={{ background: 'transparent', border: 'none', fontSize: '12px', cursor: 'pointer', padding: '4px', color: '#3b7a5a' }} title="Share">🔗</button>
                      <button onClick={() => handleVisit(r)} style={{ padding: '6px 12px', borderRadius: '100px', background: '#0a3d22', border: '1px solid #1d5c38', color: '#6ee7b7', fontSize: '11px', cursor: 'pointer', fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap' }}>{r.link ? 'Visit' : 'View'}</button>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}

          {/* ✅ Saved Resources Section — Now Functional */}
          {savedResources.length > 0 && (
            <div className="dash-section" style={{ marginTop: '1rem', borderColor: '#f59e0b' }}>
              <h3 style={{ color: '#f59e0b', fontSize: '13px', marginBottom: '0.75rem' }}>⭐ Saved ({savedResources.length})</h3>
              {savedResources.map(r => (
                <div key={r.id} style={{ padding: '8px 0', borderBottom: '1px solid #0a3d22', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>{CATEGORY_ICONS[r.category] || '📌'}</span>
                  <span style={{ color: '#e2f5ec', fontSize: '12px', flex: 1 }}>{r.name}</span>
                  <button onClick={() => handleVisit(r)} style={{ padding: '4px 10px', borderRadius: '100px', background: '#0a3d22', border: '1px solid #1d5c38', color: '#6ee7b7', fontSize: '10px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Visit</button>
                  <button onClick={() => toggleSave(r.id)} style={{ background: 'transparent', border: 'none', color: '#F09595', fontSize: '11px', cursor: 'pointer' }}>✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Suggestion Form */}
          <div className="dash-section" style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            {!showSuggestionForm ? (
              <button onClick={() => setShowSuggestionForm(true)} style={{ background: 'transparent', border: '1px solid #0a3d22', color: '#6ee7b7', padding: '10px 20px', borderRadius: '100px', fontSize: '13px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>💡 Know a resource we're missing?</button>
            ) : suggestionSent ? (
              <div style={{ padding: '1rem', background: '#0a3d22', borderRadius: '10px', border: '1px solid #6ee7b7' }}>
                <p style={{ color: '#6ee7b7', fontSize: '14px', margin: 0 }}>✅ Suggestion submitted! Thank you!</p>
              </div>
            ) : (
              <div>
                <input type="text" placeholder="Resource name *" value={suggestion.name} onChange={e => setSuggestion({ ...suggestion, name: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#041f13', border: '1px solid #0a3d22', color: '#fff', fontSize: '13px', marginBottom: '8px', fontFamily: "'Inter', sans-serif", boxSizing: 'border-box' }} />
                <input type="text" placeholder="Link (optional)" value={suggestion.link} onChange={e => setSuggestion({ ...suggestion, link: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#041f13', border: '1px solid #0a3d22', color: '#fff', fontSize: '13px', marginBottom: '8px', fontFamily: "'Inter', sans-serif", boxSizing: 'border-box' }} />
                <select value={suggestion.category} onChange={e => setSuggestion({ ...suggestion, category: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '8px', background: '#041f13', border: '1px solid #0a3d22', color: '#fff', fontSize: '13px', marginBottom: '8px', fontFamily: "'Inter', sans-serif", boxSizing: 'border-box', cursor: 'pointer' }}>
                  {ALL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={submitSuggestion} disabled={!suggestion.name.trim() || submittingSuggestion} className="btn-primary" style={{ flex: 1, padding: '10px', fontSize: '13px' }}>
                    {submittingSuggestion ? 'Submitting...' : 'Submit'}
                  </button>
                  <button onClick={() => setShowSuggestionForm(false)} style={{ padding: '10px', borderRadius: '8px', background: 'transparent', border: '1px solid #0a3d22', color: '#3b7a5a', fontSize: '13px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Emergency Button */}
      <a href={`tel:${EMERGENCY_CONTACTS[0].number}`} style={{ position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 500, background: '#791F1F', color: '#F09595', padding: '12px 18px', borderRadius: '100px', fontSize: '14px', fontWeight: 600, textDecoration: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.4)', border: '2px solid #F09595', display: 'flex', alignItems: 'center', gap: '6px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }} className="mobile-only" aria-label={`Call ${EMERGENCY_CONTACTS[0].name} at ${EMERGENCY_CONTACTS[0].number}`}>🆘 Call {EMERGENCY_CONTACTS[0].number}</a>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:0.3} 50%{opacity:0.6} }
        @media (max-width: 768px) { .main-content { margin-left: 0 !important; } .mobile-only { display: flex !important; } }
        @media (min-width: 769px) { .mobile-only { display: none; } }
      `}</style>
    </div>
  )
}
