import { Routes, Route } from 'react-router-dom';
import PlayHome from './screens/PlayHome.jsx';
import ModeSelect from './screens/ModeSelect.jsx';
import PlaySetup from './screens/PlaySetup.jsx';
import ShanghaiGame from './screens/ShanghaiGame.jsx';
import CricketGame from './screens/CricketGame.jsx';
import FiftyOneGame from './screens/FiftyOneGame.jsx';
import Bob27Game from './screens/Bob27Game.jsx';
import RoundTheClockGame from './screens/RoundTheClockGame.jsx';
import KillerGame from './screens/KillerGame.jsx';
import HalveItGame from './screens/HalveItGame.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PlayHome />} />
      <Route path="/modes" element={<ModeSelect />} />
      <Route path="/setup" element={<PlaySetup />} />
      <Route path="/shanghai" element={<ShanghaiGame />} />
      <Route path="/cricket" element={<CricketGame />} />
      <Route path="/super-cricket" element={<CricketGame />} />
      <Route path="/51" element={<FiftyOneGame />} />
      <Route path="/bob27" element={<Bob27Game />} />
      <Route path="/round-the-clock" element={<RoundTheClockGame />} />
      <Route path="/killer" element={<KillerGame />} />
      <Route path="/halve-it" element={<HalveItGame />} />
      <Route path="*" element={<PlayHome />} />
    </Routes>
  );
}
