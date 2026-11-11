import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { BrandLoader } from './components/Brand'
import { PublicOnly, RequireAuth } from './components/RouteGuards'
import { CrisisAlertCountProvider } from './context/CrisisAlertCountContext'
import { ErrorBoundary } from './components/Feedback'

const Landing = lazy(() => import('./pages/public/Landing'))
const Login = lazy(() => import('./pages/public/Login'))
const Signup = lazy(() => import('./pages/public/Signup'))
const ForgotPassword = lazy(() => import('./pages/public/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/public/ResetPassword'))
const Pricing = lazy(() => import('./pages/public/Pricing'))
const FamilyJoin = lazy(() => import('./pages/public/FamilyJoin'))
const Protection = lazy(() => import('./pages/public/Protection'))
const Privacy = lazy(() => import('./pages/public/Privacy'))
const Terms = lazy(() => import('./pages/public/Terms'))
const About = lazy(() => import('./pages/public/About'))
const Partners = lazy(() => import('./pages/public/Partners'))
const AuthCallback = lazy(() => import('./pages/public/AuthCallback'))
const NotFound = lazy(() => import('./pages/public/NotFound'))

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
const ProtectionPage = lazy(() => import('./pages/user/ProtectionPage'))

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
const TherapistManagement = lazy(() => import('./pages/admin/TherapistManagement'))
const InsurerManagement = lazy(() => import('./pages/admin/InsurerManagement'))
const FloatManagement = lazy(() => import('./pages/admin/FloatManagement'))
const TherapistDashboard = lazy(() => import('./pages/therapist/TherapistDashboard'))
const TherapistOnboarding = lazy(() => import('./pages/therapist/TherapistOnboarding'))
const TherapistClaimForm = lazy(() => import('./pages/therapist/TherapistClaimForm'))
const TherapistPayouts = lazy(() => import('./pages/therapist/TherapistPayouts'))
const InsurerLogin = lazy(() => import('./pages/insurer/InsurerLogin'))
const InsurerDashboard = lazy(() => import('./pages/insurer/InsurerDashboard'))
const InsurerClaims = lazy(() => import('./pages/insurer/InsurerClaims'))
const InsurerInvoices = lazy(() => import('./pages/insurer/InsurerInvoices'))
const InsurerAnalytics = lazy(() => import('./pages/insurer/InsurerAnalytics'))
const Demo = lazy(() => import('./pages/Demo'))
const AppShell = lazy(() => import('./layouts/AppShell'))

function App() {
  return (
    <Suspense fallback={<BrandLoader />}>
      <ErrorBoundary>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route element={<PublicOnly />}>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
        </Route>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/family-join" element={<FamilyJoin />} />
        <Route path="/protection" element={<Protection />} />
        <Route path="/insurer/login" element={<InsurerLogin />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/about" element={<About />} />
        <Route path="/partners" element={<Partners />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/demo" element={<Demo />} />

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
            <Route path="/protection-member" element={<ProtectionPage />} />
          </Route>
        </Route>
        <Route element={<RequireAuth role="therapist" />}>
          <Route element={<AppShell />}>
            <Route path="/therapist" element={<TherapistDashboard />} />
            <Route path="/therapist/onboarding" element={<TherapistOnboarding />} />
            <Route path="/therapist/claims/new" element={<TherapistClaimForm />} />
            <Route path="/therapist/payouts" element={<TherapistPayouts />} />
          </Route>
        </Route>
        <Route element={<RequireAuth role="insurer" />}>
          <Route element={<AppShell />}>
            <Route path="/insurer" element={<InsurerDashboard />} />
            <Route path="/insurer/claims" element={<InsurerClaims />} />
            <Route path="/insurer/invoices" element={<InsurerInvoices />} />
            <Route path="/insurer/analytics" element={<InsurerAnalytics />} />
          </Route>
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
          </Route>
        </Route>
        <Route element={<RequireAuth role="super_admin" />}>
          <Route element={<CrisisAlertCountProvider><AppShell admin /></CrisisAlertCountProvider>}>
            <Route path="/super-admin" element={<Navigate to="/super-admin/users" replace />} />
            <Route path="/super-admin/users" element={<UserManagement />} />
            <Route path="/super-admin/insurance" element={<InsurancePartners />} />
            <Route path="/super-admin/b2b" element={<B2BClients />} />
            <Route path="/super-admin/grants" element={<GrantApplications />} />
            <Route path="/super-admin/chats" element={<ChatViewer />} />
            <Route path="/super-admin/logs" element={<AuditLogs />} />
            <Route path="/super-admin/settings" element={<SystemSettings />} />
            <Route path="/super-admin/therapists" element={<TherapistManagement />} />
            <Route path="/super-admin/insurers" element={<InsurerManagement />} />
            <Route path="/super-admin/float" element={<FloatManagement />} />
          </Route>
          <Route path="/admin/users" element={<Navigate to="/super-admin/users" replace />} />
          <Route path="/admin/insurance" element={<Navigate to="/super-admin/insurance" replace />} />
          <Route path="/admin/b2b" element={<Navigate to="/super-admin/b2b" replace />} />
          <Route path="/admin/grants" element={<Navigate to="/super-admin/grants" replace />} />
          <Route path="/admin/chats" element={<Navigate to="/super-admin/chats" replace />} />
          <Route path="/admin/logs" element={<Navigate to="/super-admin/logs" replace />} />
          <Route path="/admin/settings" element={<Navigate to="/super-admin/settings" replace />} />
          <Route path="/admin/therapists" element={<Navigate to="/super-admin/therapists" replace />} />
          <Route path="/admin/insurers" element={<Navigate to="/super-admin/insurers" replace />} />
          <Route path="/admin/float" element={<Navigate to="/super-admin/float" replace />} />
        </Route>
        <Route element={<RequireAuth />}>
          <Route path="/admin/*" element={<NotFound />} />
          <Route path="/super-admin/*" element={<NotFound />} />
          <Route path="/therapist/*" element={<NotFound />} />
          <Route path="/insurer/*" element={<NotFound />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
      </ErrorBoundary>
    </Suspense>
  )
}

export default App
