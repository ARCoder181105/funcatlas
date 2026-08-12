// Calls inside JSX only survive if .tsx is parsed with the TSX grammar.
// Under the plain TypeScript grammar the body is one ERROR node and every
// call below the `return (` is silently lost.
import { formatLabel } from "./helpers";

export function Card() {
    const label = formatLabel("hi");
    return (
        <div className={cx("card")}>
            {renderTitle(label)}
            <span>{helper()}</span>
        </div>
    );
}
