import { Routes, Route } from 'react-router-dom';
import PlayHome from './screens/PlayHome.jsx';
import PlaySetup from './screens/PlaySetup.jsx';
import ShanghaiGame from './screens/ShanghaiGame.jsx';
import CricketGame from './screens/CricketGame.jsx';
import FiftyOneGame from './screens/FiftyOneGame.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PlayHome />} />
      <Route path="/setup" element={<PlaySetup />} />
      <Route path="/shanghai" element={<ShanghaiGame />} />
      <Route path="/cricket" element={<CricketGame />} />
      <Route path="/super-cricket" element={<CricketGame />} />
      <Route path="/51" element={<FiftyOneGame />} />
      <Route path="*" element={<PlayHome />} />
    </Routes>
  );
}
