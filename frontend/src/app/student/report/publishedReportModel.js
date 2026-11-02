export const reportEmptyMessage=()=>'等待班主任确认';
export const publishedDocumentKey=report=>report?[report.termId,report.studentId,report.id,report.version].join(':'):null;
