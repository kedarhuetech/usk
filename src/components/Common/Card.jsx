// Renders the card interface.
function Card({ children, className = "", ...props }) {
  return (
    <section className={`min-w-0 max-w-full rounded-xl border border-slate-200/90 bg-white text-slate-900 shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:border-[#252B37] dark:bg-[#151821] dark:text-slate-100 ${className}`} {...props}>
      {children}
    </section>
  );
}

export default Card;
