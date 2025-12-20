
import "./SearchBar.css";

export default function SearchBar() {
  return (
    <div className="search-wrapper">
      <input
        type="text"
        className="search-input"
        placeholder="Поиск стримов, игр или стримеров..."
      />
    </div>
  );
}