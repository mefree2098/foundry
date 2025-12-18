import { BrowserRouter, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import About from "./pages/About";
import AdminDashboard from "./pages/AdminDashboard";
import Home from "./pages/Home";
import News from "./pages/News";
import NewsDetail from "./pages/NewsDetail";
import NotFound from "./pages/NotFound";
import PlatformDetail from "./pages/PlatformDetail";
import Platforms from "./pages/Platforms";
import Subscriptions from "./pages/Subscriptions";
import TopicDetail from "./pages/TopicDetail";
import Topics from "./pages/Topics";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="platforms" element={<Platforms />} />
          <Route path="platforms/:platformSlug" element={<PlatformDetail />} />
          <Route path="news" element={<News />} />
          <Route path="news/:newsSlug" element={<NewsDetail />} />
          <Route path="topics" element={<Topics />} />
          <Route path="topics/:topicSlug" element={<TopicDetail />} />
          <Route path="about" element={<About />} />
          <Route path="subscribe" element={<Subscriptions />} />
          <Route path="admin" element={<AdminDashboard />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
