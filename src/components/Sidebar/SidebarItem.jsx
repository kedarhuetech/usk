import { useEffect, useState } from "react";
import { FiChevronDown } from "react-icons/fi";
import { NavLink, useLocation } from "react-router-dom";

// Renders individual sidebar navigation items with expandable children support.
function SidebarItem({ item }) {
  const location = useLocation();
  const hasChildren = Boolean(item.children?.length);

  const childActive = hasChildren
    ? item.children.some((child) =>
        child.path.includes("?")
          ? `${location.pathname}${location.search}` === child.path
          : location.pathname === child.path
      )
    : false;

  const isDirectActive =
    item.path === "/reports"
      ? location.pathname.startsWith("/reports")
      : item.path === "/items"
      ? location.pathname.startsWith("/items")
      : item.path === location.pathname || (item.id === "dashboard" && location.pathname === "/");

  const [open, setOpen] = useState(childActive);
  const Icon = item.icon;

  useEffect(() => {
    if (childActive) {
      setOpen(true);
    }
  }, [childActive, location.pathname, location.search]);

  if (!hasChildren) {
    return (
      <NavLink
        to={item.path}
        className={
          `relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition cursor-pointer ${
            isDirectActive
              ? "bg-[#FF5A1F]/15 text-[#FF5A1F] font-semibold"
              : "text-slate-300 hover:bg-white/10 hover:text-white"
          }`
        }
      >
        <span
          className={`absolute left-0 h-5 w-1 rounded-r-full bg-[#FF5A1F] shadow-[0_0_8px_rgba(255,90,31,0.8)] transition-opacity ${
            isDirectActive ? "opacity-100" : "opacity-0"
          }`}
        />
        <Icon className={`h-4 w-4 shrink-0 ${isDirectActive ? "text-[#FF5A1F]" : "text-slate-400"}`} />
        <span className="truncate">{item.label}</span>
      </NavLink>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] font-medium transition cursor-pointer ${
          childActive
            ? "bg-white/10 text-white font-semibold"
            : "text-slate-300 hover:bg-white/10 hover:text-white"
        }`}
      >
        <Icon className={`h-4 w-4 shrink-0 ${childActive ? "text-[#FF5A1F]" : "text-slate-400"}`} />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        <FiChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180 text-[#FF5A1F]" : "text-slate-400"}`} />
      </button>

      {open && (
        <div className="mt-0.5 space-y-0.5 pl-2">
          {item.children.map((child) => {
            const isChildActive = child.path.includes("?")
              ? `${location.pathname}${location.search}` === child.path
              : location.pathname === child.path;

            return (
              <NavLink
                key={child.id}
                to={child.path}
                className={
                  `relative flex min-h-8 items-center rounded-lg py-1.5 pl-8 pr-2.5 text-[12.5px] transition cursor-pointer ${
                    isChildActive
                      ? "bg-[#FF5A1F]/15 font-semibold text-[#FF5A1F]"
                      : "text-slate-400 hover:bg-white/10 hover:text-white"
                  }`
                }
              >
                <span
                  className={`absolute left-0 h-4 w-1 rounded-r-full bg-[#FF5A1F] shadow-[0_0_8px_rgba(255,90,31,0.8)] transition-opacity ${
                    isChildActive ? "opacity-100" : "opacity-0"
                  }`}
                />
                <span className="truncate">{child.label}</span>
              </NavLink>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default SidebarItem;
