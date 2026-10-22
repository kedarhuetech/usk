import { FiChevronRight, FiZap } from "react-icons/fi";
import {
  companySwitcher,
  sidebarBrand,
  sidebarNavigation,
  sidebarSearch,
  sidebarTrial,
} from "./SidebarData";
import SidebarItem from "./SidebarItem";

function Sidebar() {
  const SearchIcon = sidebarSearch.icon;
  const CompanyIcon = companySwitcher.icon;

  return (
    <aside className="hidden h-screen w-52 shrink-0 flex-col bg-gradient-to-b from-[#1A1F71] to-[#14185D] text-white xl:w-56 lg:flex">
      <div className="shrink-0 px-3 py-3">
        <div className="mb-3 flex items-center gap-2.5 px-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-sm font-bold text-[#1A1F71]">
            L
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{sidebarBrand.name}</p>
            <p className="truncate text-xs text-white/60">{sidebarBrand.companyName}</p>
          </div>
        </div>

        <button
          type="button"
          className="flex h-9 w-full items-center gap-2 rounded-lg bg-white/10 px-2.5 text-left text-[13px] text-white/80 hover:bg-white/15"
        >
          <SearchIcon className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{sidebarSearch.label}</span>
          <span className="text-[11px] text-white/45">{sidebarSearch.shortcut}</span>
        </button>
      </div>

      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2.5 pb-3">
        {sidebarNavigation.map((item) => (
          <SidebarItem key={item.id} item={item} />
        ))}
      </nav>

      <div className="shrink-0 space-y-2.5 p-2.5">
        <div className="rounded-lg bg-amber-50 p-2.5 text-[#14185D]">
          <p className="text-[13px] font-semibold">{sidebarTrial.title}</p>
          <div className="mt-2 h-1.5 rounded-full bg-white">
            <div className="h-full w-5/12 rounded-full bg-amber-500" />
          </div>
          <button
            type="button"
            className="mt-2 flex w-full items-center justify-between rounded-md bg-[#1A1F71] px-2.5 py-2 text-[13px] font-semibold text-white"
          >
            <span className="flex items-center gap-2">
              <FiZap className="h-4 w-4 text-amber-300" />
              {sidebarTrial.ctaLabel}
            </span>
            <FiChevronRight className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          className="flex h-10 w-full items-center gap-2.5 rounded-lg bg-white/10 px-2.5 text-left text-[13px] font-semibold hover:bg-white/15"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-[#1A1F71]">
            <CompanyIcon className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1 truncate">{companySwitcher.label}</span>
          <FiChevronRight className="h-4 w-4 text-white/60" />
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
