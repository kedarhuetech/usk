import { useEffect, useState } from "react";
import { FiChevronDown } from "react-icons/fi";
import { NavLink, useLocation } from "react-router-dom";

function SidebarItem({ item }) {
  const location = useLocation();
  const hasChildren = Boolean(item.children?.length);
  const childActive = hasChildren
    ? item.children.some((child) => location.pathname === child.path)
    : false;
  const [open, setOpen] = useState(childActive);
  const Icon = item.icon;

  useEffect(() => {
    if (childActive) setOpen(true);
  }, [childActive]);

  if (!hasChildren) {
    return (
      <NavLink
        to={item.path}
        className={({ isActive }) =>
          `relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium ${
            isActive
              ? "bg-white/14 text-white"
              : "text-white/78 hover:bg-white/10 hover:text-white"
          }`
        }
      >
        {({ isActive }) => (
          <>
            <span
              className={`absolute left-0 h-5 w-0.5 rounded-r-full bg-rose-500 ${
                isActive ? "opacity-100" : "opacity-0"
              }`}
            />
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </>
        )}
      </NavLink>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] font-medium ${
          childActive ? "bg-white/14 text-white" : "text-white/78 hover:bg-white/10 hover:text-white"
        }`}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        <FiChevronDown className={`h-4 w-4 shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-0.5 space-y-0.5">
          {item.children.map((child) => (
            <NavLink
              key={child.id}
              to={child.path}
              className={({ isActive }) =>
                `relative flex min-h-8 items-center rounded-lg py-1.5 pl-11 pr-2.5 text-[13px] ${
                  isActive
                    ? "bg-white/14 font-medium text-white"
                    : "text-white/68 hover:bg-white/10 hover:text-white"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`absolute left-0 h-5 w-0.5 rounded-r-full bg-rose-500 ${
                      isActive ? "opacity-100" : "opacity-0"
                    }`}
                  />
                  <span className="truncate">{child.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export default SidebarItem;
