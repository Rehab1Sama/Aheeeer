import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, QueryCache } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGetCurrentUser } from "@workspace/api-client-react";
import { getToken } from "@/lib/auth";
import LoginPage from "@/pages/login";
import LandingPage from "@/pages/landing";
import DashboardPage from "@/pages/dashboard";
import CirclesPage from "@/pages/circles";
import LeaderCirclesPage from "@/pages/leader-circles";
import DataEntryStatusPage from "@/pages/data-entry-status";
import AccountsPage from "@/pages/accounts";
import StatisticsPage from "@/pages/statistics";
import RegistrationManagePage from "@/pages/registration-manage";
import AttendancePage from "@/pages/attendance";
import DataEntryPage from "@/pages/data-entry";
import WhatsappEntryPage from "@/pages/whatsapp-entry";
import MyCirclePage from "@/pages/my-circle";
import MyProgressPage from "@/pages/my-progress";
import CircleOverviewPage from "@/pages/circle-overview";
import WeeklyAbsenceGroupsPage from "@/pages/weekly-absence-groups";
import SupervisorHoursPage from "@/pages/supervisor-hours";
import DistinguishedStudentsPage from "@/pages/distinguished-students";
import AudioPage from "@/pages/audio";
import TrackPage from "@/pages/track";
import TrackReportPage from "@/pages/track-report";
import TrackEntryStatusPage from "@/pages/track-entry-status";
import RegisterPage from "@/pages/register";
import StaffRegisterPage from "@/pages/staff-register";
import OnboardPage from "@/pages/onboard";
import RegisterExistingPage from "@/pages/register-existing";
import ExportPage from "@/pages/export";
import StudentProfilePage from "@/pages/student-profile";
import MonthlyReportPage from "@/pages/monthly-report";
import MessagesPage from "@/pages/messages";
import MyMessagesPage from "@/pages/my-messages";
import ArchivedStudentsPage from "@/pages/archived-students";
import ManageTracksPage from "@/pages/manage-tracks";
import DailyTasksPage from "@/pages/daily-tasks";
import LeaderTasksPage from "@/pages/leader-tasks";
import CalendarPage from "@/pages/calendar";
import StorePage from "@/pages/store";
import StoreManagePage from "@/pages/store-manage";
import VolunteerPage from "@/pages/volunteer";
import BadgesPage from "@/pages/badges";
import BadgeEntitlementsPage from "@/pages/badge-entitlements";
import TeacherRotationPage from "@/pages/teacher-rotation";
import ShortcomingsPage from "@/pages/shortcomings";
import StumblingStatsPage from "@/pages/stumbling-stats";
import DeputyTasksPage from "@/pages/deputy-tasks";
import DeputyBoardPage from "@/pages/deputy-board";
import DeputyCirclesPage from "@/pages/deputy-circles";
import PendingRegistrationsPage from "@/pages/pending-registrations";
import StudentLeavesPage from "@/pages/student-leaves";
import ActivatePage from "@/pages/activate";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import ReportsPage from "@/pages/reports";
import WhiteLabelPage from "@/pages/white-label";
import FirstSetupPage from "@/pages/first-setup";
import UnlinkedStaffPage from "@/pages/unlinked-staff";
import UnlinkedStudentsPage from "@/pages/unlinked-students";
import ArchivedStaffPage from "@/pages/archived-staff";
import DbSettingsPage from "@/pages/db-settings";
import AuditLogPage from "@/pages/audit-log";
import DuplicateStudentsPage from "@/pages/duplicate-students";
import TransferRequestsPage from "@/pages/transfer-requests";
import MessagesHub from "@/pages/messages-hub";
import RegistrationStudentsPage from "@/pages/registration-students";
import RegistrationPoolSearchPage from "@/pages/registration-pool-search";
import CirclesStaffingPage from "@/pages/circles-staffing";
import ReviewPlansOverviewPage from "@/pages/review-plans-overview";
import CertificatesPage from "@/pages/certificates";
import MyCertificatePage from "@/pages/my-certificate";
import DisabledAccountPage from "@/pages/disabled-account";
import Layout from "@/components/Layout";
import NotFound from "@/pages/not-found";
import { canEnterData, isFeatureEnabled } from "@/lib/schoolConfig";

// فشل تحميل بيانات أي صفحة: تنبيه واضح بالعربية بدل صفحة فارغة صامتة (مرة واحدة لكل رسالة خلال ١٠ ثوانٍ)
let lastQueryErrorAt = 0;
let lastQueryError = "";
const queryCache = new QueryCache({
  onError: (error, query) => {
    const status = (error as { status?: number })?.status;
    if (status === 401 || query.meta?.silent) return;
    const message = error instanceof Error && error.message ? error.message : "تعذّر تحميل البيانات";
    const now = Date.now();
    if (message === lastQueryError && now - lastQueryErrorAt < 10000) return;
    lastQueryError = message;
    lastQueryErrorAt = now;
    toast({ title: "تعذّر تحميل بعض البيانات", description: `${message}. حدّثي الصفحة أو حاولي بعد قليل.`, variant: "destructive" });
  },
});

const queryClient = new QueryClient({
  queryCache,
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 60000,
      // كان كل رجوع للتبويب/التطبيق يعيد جلب كل الاستعلامات المفتوحة — استهلاك كبير لنقل البيانات.
      refetchOnWindowFocus: false,
    },
  },
});

function getHomePageForRole(role: string) {
  if (role === "leader") return DashboardPage;
  if (role === "deputy") return DashboardPage;
  if (role === "data_entry") return DataEntryPage;
  if (role === "teacher" || role === "supervisor") return MyCirclePage;
  if (role === "student") return MyProgressPage;
  if (role === "track_supervisor") return TrackPage;
  return DashboardPage;
}

function AppRoutes() {
  const token = getToken();
  const { data: user, isLoading } = useGetCurrentUser({
    query: { enabled: !!token, queryKey: ["getCurrentUser"] }
  });

  if (isLoading && token) {
    return (
      <div className="min-h-screen flex items-center justify-center gradient-bg-soft">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-primary font-semibold text-lg">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (!token || !user) {
    return (
      <Switch>
        <Route path="/register" component={RegisterPage} />
        <Route path="/register-existing" component={RegisterExistingPage} />
        <Route path="/staff-register" component={StaffRegisterPage} />
        <Route path="/activate" component={ActivatePage} />
        <Route path="/forgot-password" component={ForgotPasswordPage} />
        <Route path="/reset-password" component={ResetPasswordPage} />
        <Route path="/store" component={StorePage} />
        <Route path="/calendar-public">
          <CalendarPage publicView />
        </Route>
        <Route path="/login" component={LoginPage} />
        <Route path="/" component={LandingPage} />
        <Route>
          <Redirect to="/login" />
        </Route>
      </Switch>
    );
  }

  if ((user as any).isArchived) {
    return <DisabledAccountPage />;
  }

  const HomePage = getHomePageForRole(user.role);
  const isLeader = user.role === "leader";
  const isDeputy = (user.role as string) === "deputy";
  const isLeaderOrDeputy = isLeader || isDeputy;
  const isTrackSupervisor = user.role === "track_supervisor";
  const isDataEntry = user.role === "data_entry";
  const isStudent = user.role === "student";
  const isTeacher = user.role === "teacher";
  const isSupervisor = user.role === "supervisor";
  const isVolunteer = user.role === "volunteer";
  const isExamSupervisor = user.role === "exam_supervisor";
  const canViewStats = ["leader", "deputy", "track_supervisor", "teacher", "supervisor", "student", "exam_supervisor"].includes(user.role);
  const canViewProfile = isLeader || isDeputy || isTrackSupervisor || isTeacher || isSupervisor;

  return (
    <Layout user={user}>
      <Switch>
        {(isVolunteer || isExamSupervisor)
          ? <Route path="/"><VolunteerPage key={String((user as any).circleId ?? user.id)} userRole={user.role} /></Route>
          : <Route path="/">{() => <HomePage key={String((user as any).circleId ?? user.id)} />}</Route>}

        <Route path="/register" component={RegisterPage} />
        <Route path="/register-existing" component={RegisterExistingPage} />
        <Route path="/staff-register" component={StaffRegisterPage} />
        <Route path="/login"><Redirect to="/" /></Route>

        {/* Leader and Deputy shared routes */}
        <Route path="/circles">
          {(isLeader || isTrackSupervisor || isDeputy) ? <LeaderCirclesPage /> : <Redirect to="/" />}
        </Route>
        <Route path="/deputy-circles">
          {isDeputy ? <DeputyCirclesPage /> : <Redirect to="/" />}
        </Route>
        <Route path="/data-entry-status">
          {isLeader ? <DataEntryStatusPage /> : <Redirect to="/" />}
        </Route>
        <Route path="/supervisor-hours">
          {isLeaderOrDeputy ? <SupervisorHoursPage /> : <Redirect to="/" />}
        </Route>
        <Route path="/accounts">
          {(isLeaderOrDeputy || isTrackSupervisor) ? <AccountsPage /> : <Redirect to="/" />}
        </Route>
        <Route path="/statistics">
          {(canViewStats && isFeatureEnabled("stats_general")) ? <StatisticsPage /> : <Redirect to="/" />}
        </Route>
        <Route path="/data-entry">
          {(isLeader || isDataEntry || isTrackSupervisor || canEnterData(user.role)) ? <DataEntryPage /> : <Redirect to="/" />}
        </Route>
        <Route path="/whatsapp-entry">
          {(isLeader || isTrackSupervisor || canEnterData(user.role)) ? <WhatsappEntryPage /> : <Redirect to="/" />}
        </Route>
        <Route path="/registration">
          {isLeader && isFeatureEnabled("registration") ? <RegistrationManagePage /> : <Redirect to="/" />}
        </Route>
        <Route path="/pending-registrations">
          {(isLeaderOrDeputy || isTrackSupervisor) && isFeatureEnabled("registration") ? <PendingRegistrationsPage /> : <Redirect to="/" />}
        </Route>
        <Route path="/onboard">
          {isLeaderOrDeputy ? <OnboardPage /> : <Redirect to="/" />}
        </Route>
        <Route path="/export">
          {(isLeaderOrDeputy || isTrackSupervisor) ? <ExportPage /> : <Redirect to="/" />}
        </Route>
        <Route path="/monthly-report">
          {(isLeaderOrDeputy || isTrackSupervisor) && isFeatureEnabled("stats_monthly") ? <MonthlyReportPage /> : <Redirect to="/" />}
        </Route>
        <Route path="/archived-students">
          {(isLeaderOrDeputy || isTrackSupervisor) ? <ArchivedStudentsPage /> : <Redirect to="/" />}
        </Route>
        <Route path="/track-report">
          {isTrackSupervisor ? <TrackReportPage /> : <Redirect to="/" />}
        </Route>
        <Route path="/distinguished-students">
          {isTrackSupervisor ? <DistinguishedStudentsPage /> : <Redirect to="/" />}
        </Route>
        <Route path="/track-entry-status">
          {isTrackSupervisor ? <TrackEntryStatusPage /> : <Redirect to="/" />}
        </Route>
        <Route path="/manage-tracks">
          {isLeaderOrDeputy ? <ManageTracksPage /> : <Redirect to="/" />}
        </Route>
        <Route path="/leader-tasks">
          {isLeaderOrDeputy ? <LeaderTasksPage /> : <Redirect to="/" />}
        </Route>
        <Route path="/daily-tasks">
          {(isLeaderOrDeputy || isTrackSupervisor) ? <DailyTasksPage /> : <Redirect to="/" />}
        </Route>
        <Route path="/messages">
          {isTrackSupervisor && isFeatureEnabled("messages") ? <MessagesHub initialTab="inbox" />
            : isLeaderOrDeputy && isFeatureEnabled("messages") ? <MessagesPage /> : <Redirect to="/" />}
        </Route>
        <Route path="/my-messages">
          {isTrackSupervisor && isFeatureEnabled("messages") ? <MessagesHub initialTab="inbox" />
            : (isStudent || isTeacher || isSupervisor) && isFeatureEnabled("messages")
            ? <MyMessagesPage />
            : <Redirect to="/" />}
        </Route>
        <Route path="/attendance">
          {(isLeaderOrDeputy || isTrackSupervisor || isStudent) ? <AttendancePage /> : <Redirect to="/" />}
        </Route>
        <Route path="/audio">
          {isStudent && isFeatureEnabled("audio") ? <AudioPage /> : <Redirect to="/" />}
        </Route>
        <Route path="/store">
          {isFeatureEnabled("store") ? <StorePage /> : <Redirect to="/" />}
        </Route>
        <Route path="/store-manage">
          {isLeaderOrDeputy && isFeatureEnabled("store") ? <StoreManagePage /> : <Redirect to="/" />}
        </Route>
        <Route path="/teacher-rotation">
          {(isLeaderOrDeputy || isTrackSupervisor || isTeacher) && isFeatureEnabled("teacher_rotation") ? <TeacherRotationPage userRole={user.role} userId={(user as any).id} /> : <Redirect to="/" />}
        </Route>
        <Route path="/calendar">
          {isFeatureEnabled("calendar") ? <CalendarPage userRole={user.role} userId={user.id} /> : <Redirect to="/" />}
        </Route>
        <Route path="/calendar-public">
          <CalendarPage publicView />
        </Route>
        <Route path="/shortcomings">
          {(isLeaderOrDeputy || isTrackSupervisor || isStudent || isTeacher || isSupervisor) && isFeatureEnabled("shortcomings") ? <ShortcomingsPage /> : <Redirect to="/" />}
        </Route>
        <Route path="/stumbling-stats">
          {(isLeaderOrDeputy || isTrackSupervisor) && isFeatureEnabled("stats_stumbling") ? <StumblingStatsPage /> : <Redirect to="/" />}
        </Route>
        <Route path="/badges">
          {isFeatureEnabled("badges") ? <BadgesPage userRole={user.role} userId={user.id} /> : <Redirect to="/" />}
        </Route>
        <Route path="/badge-entitlements">
          <BadgeEntitlementsPage userRole={user.role} />
        </Route>
        <Route path="/volunteer">
          {(isVolunteer || isExamSupervisor || isLeaderOrDeputy || isTrackSupervisor)
            ? <VolunteerPage userRole={user.role} />
            : <Redirect to="/" />}
        </Route>

        {/* Deputy specific routes */}
        <Route path="/deputy-tasks">
          {isDeputy && isFeatureEnabled("deputy_tasks") ? <DeputyTasksPage /> : <Redirect to="/" />}
        </Route>
        <Route path="/deputy-board">
          {isLeader && isFeatureEnabled("deputy_tasks") ? <DeputyBoardPage /> : <Redirect to="/" />}
        </Route>
        <Route path="/student-leaves">
          {(isLeader || isDeputy || isTrackSupervisor) && isFeatureEnabled("leaves") ? <StudentLeavesPage /> : <Redirect to="/" />}
        </Route>

        <Route path="/reports">
          {isLeaderOrDeputy && isFeatureEnabled("stats_weekly") ? <ReportsPage /> : <Redirect to="/" />}
        </Route>
        <Route path="/white-label">
          {isLeader ? <WhiteLabelPage /> : <Redirect to="/" />}
        </Route>
        <Route path="/first-setup">
          {isLeader ? <FirstSetupPage /> : <Redirect to="/" />}
        </Route>
        <Route path="/unlinked-staff">
          {isLeaderOrDeputy ? <UnlinkedStaffPage /> : <Redirect to="/" />}
        </Route>
        <Route path="/unlinked-students">
          {isLeaderOrDeputy ? <UnlinkedStudentsPage /> : <Redirect to="/" />}
        </Route>
        <Route path="/archived-staff">
          {isLeaderOrDeputy ? <ArchivedStaffPage /> : <Redirect to="/" />}
        </Route>
        <Route path="/db-settings">
          {isLeader ? <DbSettingsPage /> : <Redirect to="/" />}
        </Route>
        <Route path="/transfer-requests">
          {["leader", "deputy", "track_supervisor", "teacher", "supervisor"].includes(user.role) ? <TransferRequestsPage canDecide={isLeaderOrDeputy} /> : <Redirect to="/" />}
        </Route>
        <Route path="/duplicate-students">
          {isLeaderOrDeputy ? <DuplicateStudentsPage isLeader={isLeader} /> : <Redirect to="/" />}
        </Route>
        <Route path="/audit-log">
          {isLeader ? <AuditLogPage /> : <Redirect to="/" />}
        </Route>
        <Route path="/registration-students">
          {isLeaderOrDeputy ? <RegistrationStudentsPage /> : <Redirect to="/" />}
        </Route>
        <Route path="/registration-pool-search">
          {isTrackSupervisor ? <RegistrationPoolSearchPage /> : <Redirect to="/" />}
        </Route>
        <Route path="/circles-staffing">
          {isLeaderOrDeputy ? <CirclesStaffingPage /> : <Redirect to="/" />}
        </Route>
        <Route path="/review-plans-overview">
          {(isLeaderOrDeputy || isTrackSupervisor || isTeacher || isSupervisor || isStudent)
            ? <ReviewPlansOverviewPage userRole={user.role} />
            : <Redirect to="/" />}
        </Route>
        <Route path="/certificates">
          {(isLeaderOrDeputy || isTrackSupervisor) ? <CertificatesPage /> : <Redirect to="/" />}
        </Route>
        <Route path="/my-certificate">
          {isStudent ? <MyCertificatePage /> : <Redirect to="/" />}
        </Route>

        <Route path="/students/:id">
          {(params) =>
            canViewProfile
              ? <StudentProfilePage id={parseInt(params.id)} />
              : <Redirect to="/" />
          }
        </Route>

        <Route path="/circle/:id">
          {(params) =>
            (isLeaderOrDeputy || isTrackSupervisor || isTeacher || isSupervisor || isStudent)
              ? <CircleOverviewPage circleId={parseInt(params.id)} />
              : <Redirect to="/" />
          }
        </Route>

        <Route path="/weekly-absence-groups">
          {isLeaderOrDeputy ? <WeeklyAbsenceGroupsPage /> : <Redirect to="/" />}
        </Route>

        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppRoutes />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
