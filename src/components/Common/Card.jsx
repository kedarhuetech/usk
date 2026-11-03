// Renders the card interface.
function Card({ children, className = "", ...props }) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white text-slate-800 dark:border-[#252B37] dark:bg-[#151821] dark:text-slate-100 ${className}`} {...props}>
      {children}
    </section>
  );
}

export default Card;
