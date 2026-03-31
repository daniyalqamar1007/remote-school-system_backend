// utils/pagination.ts
export const getPaginationMeta = (currentPage: number, limit: number, totalCount: number) => {
    const totalPages = Math.ceil(totalCount / limit);
    return {
        page: currentPage,
        currentPage, // Keep for backward compatibility
        total: totalCount,
        totalCount, // Keep for backward compatibility
        totalPages,
        limit,
        hasNext: currentPage < totalPages,
        hasPrev: currentPage > 1,
    };
};