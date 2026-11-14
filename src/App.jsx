import { Navigate, Route, Routes } from 'react-router-dom';
import { LearnerProvider } from './context/LearnerContext.jsx';
import Layout from './components/Layout.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import Welcome from './pages/Welcome.jsx';
import { AdminLogin, AdminRegister, ForgotPassword, Login, Register, ResetPassword } from './pages/Auth.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Courses from './pages/Courses.jsx';
import Modes from './pages/Modes.jsx';
import PreTest from './pages/PreTest.jsx';
import Results from './pages/Results.jsx';
import Path from './pages/Path.jsx';
import Lesson from './pages/Lesson.jsx';
import PostQuiz from './pages/PostQuiz.jsx';
import Glossary from './pages/Glossary.jsx';
import Progress from './pages/Progress.jsx';
import Profile from './pages/Profile.jsx';
import InstructorProfile from './pages/InstructorProfile.jsx';
import AdminGlossary from './pages/AdminGlossary.jsx';
import AdminOverview from './pages/AdminOverview.jsx';
import AdminCourses from './pages/AdminCourses.jsx';
import AdminStudents from './pages/AdminStudents.jsx';
import AdminEnrollments from './pages/AdminEnrollments.jsx';
import AdminAssessments from './pages/AdminAssessments.jsx';
import StudentQuiz from './pages/StudentQuiz.jsx';
import StudentCertificates from './pages/StudentCertificates.jsx';
import AdminCertificates from './pages/AdminCertificates.jsx';
import AdminReports from './pages/AdminReports.jsx';
import Catalog from './pages/Catalog.jsx';
import CourseViewer from './pages/CourseViewer.jsx';
import ModulePlayer from './pages/ModulePlayer.jsx';
import CoursePretest from './pages/CoursePretest.jsx';
import AdminPretest from './pages/AdminPretest.jsx';
import AssignmentPage from './pages/AssignmentPage.jsx';
import AdminAssignments from './pages/AdminAssignments.jsx';
import AdminSubmissions from './pages/AdminSubmissions.jsx';
import AdminContent from './pages/AdminContent.jsx';
import StudentMaterials from './pages/StudentMaterials.jsx';
import Analytics from './pages/Analytics.jsx';
import CourseModules from './pages/CourseModules.jsx';
import ModuleLesson from './pages/ModuleLesson.jsx';
import ModuleQuiz from './pages/ModuleQuiz.jsx';
import ModuleResultsPage from './pages/ModuleResultsPage.jsx';
import RequireRole from './components/RequireRole.jsx';
import NativeBridge from './components/NativeBridge.jsx';

export default function App() {
  return (
    <>
    <NativeBridge />
    <Routes>
      <Route path="/" element={<Welcome />} />
      <Route path="/login" element={<Login />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin/register" element={<AdminRegister />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route
        element={
          <RequireAuth>
            <LearnerProvider>
              <Layout />
            </LearnerProvider>
          </RequireAuth>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/courses" element={<Courses />} />
        <Route path="/catalog" element={<Catalog />} />
        <Route path="/learn/:courseId" element={<CourseViewer />} />
        <Route path="/learn/:courseId/quiz/:quizId" element={<StudentQuiz />} />
        <Route path="/learn/:courseId/module/:moduleId" element={<ModulePlayer />} />
        <Route path="/learn/:courseId/pretest" element={<CoursePretest />} />
        <Route path="/learn/:courseId/assignment/:assignmentId" element={<AssignmentPage />} />
        <Route path="/modes" element={<Modes />} />
        <Route path="/pretest" element={<PreTest />} />
        <Route path="/results" element={<Results />} />
        <Route path="/path" element={<Path />} />
        <Route path="/lesson/:id" element={<Lesson />} />
        <Route path="/quiz/:id" element={<PostQuiz />} />
        <Route path="/course/:courseId" element={<CourseModules />} />
        <Route path="/course/:courseId/:moduleId" element={<ModuleLesson />} />
        <Route path="/course/:courseId/:moduleId/quiz" element={<ModuleQuiz />} />
        <Route path="/course/:courseId/:moduleId/results/:attemptId" element={<ModuleResultsPage />} />
        <Route path="/glossary" element={<Glossary />} />
        <Route path="/progress" element={<Progress />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/admin" element={<RequireRole role="admin"><AdminOverview /></RequireRole>} />
        <Route path="/admin/courses" element={<RequireRole role="admin"><AdminCourses /></RequireRole>} />
        <Route path="/admin/students" element={<RequireRole role="admin"><AdminStudents /></RequireRole>} />
        <Route path="/admin/enrollments" element={<RequireRole role="admin"><AdminEnrollments /></RequireRole>} />
        <Route path="/admin/assessments" element={<RequireRole role="admin"><AdminAssessments /></RequireRole>} />
        <Route path="/materials" element={<StudentMaterials />} />
        <Route path="/certificates" element={<StudentCertificates />} />
        <Route path="/admin/content" element={<RequireRole role="admin"><AdminContent /></RequireRole>} />
        <Route path="/admin/analytics" element={<RequireRole role="admin"><AdminReports /></RequireRole>} />
        <Route path="/admin/assistant" element={<RequireRole role="admin"><Analytics /></RequireRole>} />
        <Route path="/admin/certificates" element={<RequireRole role="admin"><AdminCertificates /></RequireRole>} />
        <Route path="/admin/profile" element={<RequireRole role="admin"><InstructorProfile /></RequireRole>} />
        <Route path="/admin/glossary" element={<RequireRole role="admin"><AdminGlossary /></RequireRole>} />
        <Route path="/admin/pretest" element={<RequireRole role="admin"><AdminPretest /></RequireRole>} />
        <Route path="/admin/assignments" element={<RequireRole role="admin"><AdminAssignments /></RequireRole>} />
        <Route path="/admin/assignments/:assignmentId" element={<RequireRole role="admin"><AdminSubmissions /></RequireRole>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}
