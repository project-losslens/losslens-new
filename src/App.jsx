import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import ElevatedRoute from './components/ElevatedRoute'

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
import SubscriptionPage from './pages/user/SubscriptionPage'

import AdminDashboard from './pages/admin/AdminDashboard'
import ManageEvents from './pages/admin/ManageEvents'
import ManageGroups from './pages/admin/ManageGroups'
import ManageResources from './pages/admin/ManageResources'
import UserAnalytics from './pages/admin/UserAnalytics'
import Broadcast from './pages/admin/Broadcast'
import CrisisAlerts from './pages/admin/CrisisAlerts'
import AdminLayout from './pages/admin/AdminLayout'
import UserManagement from './pages/admin/UserManagement'
import AuditLogs from './pages/admin/AuditLogs'
import B2BClients from './pages/admin/B2BClients'
import InsurancePartners from './pages/admin/InsurancePartners'
import GrantApplications from './pages/admin/GrantApplications'
import ChatViewer from './pages/admin/ChatViewer'
import SystemSettings from './pages/admin/SystemSettings'

function App() {
  return (
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
        <Route path="/subscription" element={<ProtectedRoute><SubscriptionPage /></ProtectedRoute>} />

        {/* Admin */}
        <Route path="/admin" element={<ProtectedRoute adminOnly><AdminLayout /></ProtectedRoute>}>
          <Route index element={<AdminDashboard />} />
          <Route path="events" element={<ManageEvents />} />
          <Route path="groups" element={<ManageGroups />} />
          <Route path="resources" element={<ManageResources />} />
          <Route path="analytics" element={<UserAnalytics />} />
          <Route path="broadcast" element={<Broadcast />} />
          <Route path="crisis" element={<CrisisAlerts />} />
          <Route path="users" element={<ElevatedRoute><UserManagement /></ElevatedRoute>} />
          <Route path="insurance" element={<ElevatedRoute><InsurancePartners /></ElevatedRoute>} />
          <Route path="b2b" element={<ElevatedRoute><B2BClients /></ElevatedRoute>} />
          <Route path="grants" element={<ElevatedRoute><GrantApplications /></ElevatedRoute>} />
          <Route path="chats" element={<ElevatedRoute><ChatViewer /></ElevatedRoute>} />
          <Route path="logs" element={<ElevatedRoute><AuditLogs /></ElevatedRoute>} />
          <Route path="settings" element={<ElevatedRoute><SystemSettings /></ElevatedRoute>} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
  )
}

export default App
