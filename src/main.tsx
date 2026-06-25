import { render } from "preact";
import "./index.css";
import MatchPlayground from "./playground/match/index.tsx";

render(<MatchPlayground />, document.getElementById("app")!);
