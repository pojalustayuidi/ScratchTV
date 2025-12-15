import { useState, useRef, useEffect } from "react";
import "./NotificationMenu.css";

export default function NotificationMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="notification-wrapper" ref={ref}>
      <button className="notification-icon" onClick={() => setOpen(!open)}>
        ⩍
      </button>
      {open && (
        <div className="notification-menu">
          <p>Пока нет уведомлений</p>
        </div>
      )}
    </div>
  );
}
