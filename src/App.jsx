import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './layouts/AppShell'
import PageLoader from './components/PageLoader'
import RequireAuth from './components/RequireAuth'
import RequireElevated from './components/RequireElevated'
import { CrisisAlertCountProvider } from './context/CrisisAlertCountContext'

const Landing = lazy(() => import('./pages/public/Landing'))
const Login = lazy(() => import('./pages/public/Login'))
const Signup = lazy(() => import('./pages/public/Signup'))
const ForgotPassword = lazy(() => import('./pages/public/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/public/ResetPassword'))
const Pricing = lazy(() => import('./pages/public/Pricing'))
const FamilyJoin = lazy(() => import('./pages/public/FamilyJoin'))

const Dashboard = lazy(() => import('./pages/user/Dashboard'))
const Diary = lazy(() => import('./pages/user/Diary'))
const CBTModules = lazy(() => import('./pages/user/CBTModules'))
const UrgeToolkitPage = lazy(() => import('./pages/user/UrgeToolkitPage'))
const TheCircle = lazy(() => import('./pages/user/TheCircle'))
const Whispers = lazy(() => import('./pages/user/Whispers'))
const Events = lazy(() => import('./pages/user/Events'))
const Resources = lazy(() => import('./pages/user/Resources'))
const Profile = lazy(() => import('./pages/user/Profile'))
const PreciousPactPage = lazy(() => import('./pages/user/PreciousPactPage'))
const MonthlyMirrorPage = lazy(() => import('./pages/user/MonthlyMirrorPage'))
const FamilyPortalPage = lazy(() => import('./pages/user/FamilyPortalPage'))
const Onboarding = lazy(() => import('./pages/user/Onboarding'))
const SubscriptionPage = lazy(() => import('./pages/user/SubscriptionPage'))

const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const ManageEvents = lazy(() => import('./pages/admin/ManageEvents'))
const ManageGroups = lazy(() => import('./pages/admin/ManageGroups'))
const ManageResources = lazy(() => import('./pages/admin/ManageResources'))
const UserAnalytics = lazy(() => import('./pages/admin/UserAnalytics'))
const Broadcast = lazy(() => import('./pages/admin/Broadcast'))
const CrisisAlerts = lazy(() => import('./pages/admin/CrisisAlerts'))
const UserManagement = lazy(() => import('./pages/admin/UserManagement'))
const AuditLogs = lazy(() => import('./pages/admin/AuditLogs'))
const B2BClients = lazy(() => import('./pages/admin/B2BClients'))
const InsurancePartners = lazy(() => import('./pages/admin/InsurancePartners'))
const GrantApplications = lazy(() => import('./pages/admin/GrantApplications'))
const ChatViewer = lazy(() => import('./pages/admin/ChatViewer'))
const SystemSettings = lazy(() => import('./pages/admin/SystemSettings'))

function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/family-join" element={<FamilyJoin />} />

        <Route element={<RequireAuth />}>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/diary" element={<Diary />} />
            <Route path="/cbt" element={<CBTModules />} />
            <Route path="/urge-toolkit" element={<UrgeToolkitPage />} />
            <Route path="/circle" element={<TheCircle />} />
            <Route path="/whispers" element={<Whispers />} />
            <Route path="/events" element={<Events />} />
            <Route path="/resources" element={<Resources />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/precious-pact" element={<PreciousPactPage />} />
            <Route path="/monthly-mirror" element={<MonthlyMirrorPage />} />
            <Route path="/family-portal" element={<FamilyPortalPage />} />
            <Route path="/subscription" element={<SubscriptionPage />} />
          </Route>
          <Route element={<RequireAuth role="admin" />}>
            <Route element={<CrisisAlertCountProvider><AppShell admin /></CrisisAlertCountProvider>}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/events" element={<ManageEvents />} />
              <Route path="/admin/groups" element={<ManageGroups />} />
              <Route path="/admin/resources" element={<ManageResources />} />
              <Route path="/admin/analytics" element={<UserAnalytics />} />
              <Route path="/admin/broadcast" element={<Broadcast />} />
              <Route path="/admin/crisis" element={<CrisisAlerts />} />
              <Route element={<RequireElevated />}>
                <Route path="/admin/users" element={<UserManagement />} />
                <Route path="/admin/insurance" element={<InsurancePartners />} />
                <Route path="/admin/b2b" element={<B2BClients />} />
                <Route path="/admin/grants" element={<GrantApplications />} />
                <Route path="/admin/chats" element={<ChatViewer />} />
                <Route path="/admin/logs" element={<AuditLogs />} />
                <Route path="/admin/settings" element={<SystemSettings />} />
              </Route>
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  )
}

export default App
