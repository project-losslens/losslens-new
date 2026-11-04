import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import SiteGate from './components/SiteGate'

import Landing from './pages/public/Landing'
import Login from './pages/public/Login'
import Signup from './pages/public/Signup'
import ForgotPassword from './pages/public/ForgotPassword'
import ResetPassword from './pages/public/ResetPassword'
import Pricing from './pages/public/Pricing'
import FamilyJoin from './pages/public/FamilyJoin'

import Dashboard from './pages/user/Dashboard'
import Diary from './pages/user/Diary'
import CBTModules from './pages/user/CBTModules'
import UrgeToolkitPage from './pages/user/UrgeToolkitPage'
import TheCircle from './pages/user/TheCircle'
import Whispers from './pages/user/Whispers'
import Events from './pages/user/Events'
import Resources from './pages/user/Resources'
import Profile from './pages/user/Profile'
import PreciousPactPage from './pages/user/PreciousPactPage'
import MonthlyMirrorPage from './pages/user/MonthlyMirrorPage'
import FamilyPortalPage from './pages/user/FamilyPortalPage'
import Onboarding from './pages/user/Onboarding'

import AdminDashboard from './pages/admin/AdminDashboard'
import ManageEvents from './pages/admin/ManageEvents'
import ManageGroups from './pages/admin/ManageGroups'
import ManageResources from './pages/admin/ManageResources'
import UserAnalytics from './pages/admin/UserAnalytics'
import Broadcast from './pages/admin/Broadcast'
import CrisisAlerts from './pages/admin/CrisisAlerts'

import SuperAdminDashboard from './pages/super-admin/SuperAdminDashboard'
import UserManagement from './pages/super-admin/UserManagement'
import AdminManagement from './pages/super-admin/AdminManagement'
import SystemSettings from './pages/super-admin/SystemSettings'
import AuditLogs from './pages/super-admin/AuditLogs'
import B2BClients from './pages/super-admin/B2BClients'
import InsurancePartners from './pages/super-admin/InsurancePartners'
import GrantApplications from './pages/super-admin/GrantApplications'
import ChatViewer from './pages/super-admin/ChatViewer'

// TODO: Remove hardcoded password during testing
const SITE_PASSWORD = 'precious2026'

function App() {
  return (
    <SiteGate sitePassword={SITE_PASSWORD}>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/family-join" element={<FamilyJoin />} />

        {/* User */}
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/diary" element={<ProtectedRoute><Diary /></ProtectedRoute>} />
        <Route path="/cbt" element={<ProtectedRoute><CBTModules /></ProtectedRoute>} />
        <Route path="/urge-toolkit" element={<ProtectedRoute><UrgeToolkitPage /></ProtectedRoute>} />
        <Route path="/circle" element={<ProtectedRoute><TheCircle /></ProtectedRoute>} />
        <Route path="/whispers" element={<ProtectedRoute><Whispers /></ProtectedRoute>} />
        <Route path="/events" element={<ProtectedRoute><Events /></ProtectedRoute>} />
        <Route path="/resources" element={<ProtectedRoute><Resources /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/precious-pact" element={<ProtectedRoute><PreciousPactPage /></ProtectedRoute>} />
        <Route path="/monthly-mirror" element={<ProtectedRoute><MonthlyMirrorPage /></ProtectedRoute>} />
        <Route path="/family-portal" element={<ProtectedRoute><FamilyPortalPage /></ProtectedRoute>} />
        <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />

        {/* Admin */}
        <Route path="/admin" element={<ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>} />
        <Route path="/admin/events" element={<ProtectedRoute adminOnly><ManageEvents /></ProtectedRoute>} />
        <Route path="/admin/groups" element={<ProtectedRoute adminOnly><ManageGroups /></ProtectedRoute>} />
        <Route path="/admin/resources" element={<ProtectedRoute adminOnly><ManageResources /></ProtectedRoute>} />
        <Route path="/admin/analytics" element={<ProtectedRoute adminOnly><UserAnalytics /></ProtectedRoute>} />
        <Route path="/admin/broadcast" element={<ProtectedRoute adminOnly><Broadcast /></ProtectedRoute>} />
        <Route path="/admin/crisis" element={<ProtectedRoute adminOnly><CrisisAlerts /></ProtectedRoute>} />

        {/* Super Admin */}
        <Route path="/super-admin" element={<ProtectedRoute superAdminOnly><SuperAdminDashboard /></ProtectedRoute>} />
        <Route path="/super-admin/users" element={<ProtectedRoute superAdminOnly><UserManagement /></ProtectedRoute>} />
        <Route path="/super-admin/admins" element={<ProtectedRoute superAdminOnly><AdminManagement /></ProtectedRoute>} />
        <Route path="/super-admin/settings" element={<ProtectedRoute superAdminOnly><SystemSettings /></ProtectedRoute>} />
        <Route path="/super-admin/logs" element={<ProtectedRoute superAdminOnly><AuditLogs /></ProtectedRoute>} />
        <Route path="/super-admin/b2b" element={<ProtectedRoute superAdminOnly><B2BClients /></ProtectedRoute>} />
        <Route path="/super-admin/insurance" element={<ProtectedRoute superAdminOnly><InsurancePartners /></ProtectedRoute>} />
        <Route path="/super-admin/grants" element={<ProtectedRoute superAdminOnly><GrantApplications /></ProtectedRoute>} />
        <Route path="/super-admin/chats" element={<ProtectedRoute superAdminOnly><ChatViewer /></ProtectedRoute>} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </SiteGate>
  )
}

export default App
