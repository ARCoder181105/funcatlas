import { shout } from "./util.js";

function renderTitle(title) {
  return <h1 className={cx("title")}>{shout(title)}</h1>;
}

export default function Card({ title, items }) {
  const label = formatLabel(title);
  return (
    <section>
      {renderTitle(label)}
      <ul>
        {items.map((item) => (
          <li key={item.id}>{describeItem(item)}</li>
        ))}
      </ul>
      <p>{`total ${countItems(items)}`}</p>
    </section>
  );
}

function formatLabel(title) {
  return title.trim();
}

function cx(name) {
  return name;
}

function describeItem(item) {
  return item.name;
}

function countItems(items) {
  return items.length;
}
