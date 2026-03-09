import { render } from "preact";
import "./index.css";
import IsometricWorld from "./isometric/page.tsx";
import MatchPlayground from "./playground/match/index.tsx";

render(<MatchPlayground />, document.getElementById("app")!);
