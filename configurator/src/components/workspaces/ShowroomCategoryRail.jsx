export default function ShowroomCategoryRail({
  categories = [],
  selectedCategory,
  onCategoryChange,
  allowUnavailableSelection = false,
}) {
  const categoriesAreInteractive = typeof onCategoryChange === 'function';

  return (
    <nav aria-label="Material categories" className="showroom-category-rail">
      <div className="showroom-category-heading">
        <span>Explore</span>
        <strong>Materials</strong>
      </div>
      <div className="showroom-category-list">
        {categories.map((category) => {
          const canChoose = categoriesAreInteractive
            && (category.available !== false || allowUnavailableSelection === true);
          return (
            <button
              aria-pressed={category.key === selectedCategory}
              className={category.key === selectedCategory ? 'is-active' : undefined}
              disabled={!canChoose}
              key={category.key}
              onClick={canChoose ? () => onCategoryChange(category.key) : undefined}
              type="button"
            >
              <span>{category.label}</span>
              {category.available === false && (
                <small>{category.unavailableReason || 'Unavailable in this 3D model'}</small>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
