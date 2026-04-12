export interface ReviewFeedback {
  comment: string;
  rating: number | null;
}

const REVIEW_FEEDBACK_PREFIX = '__WF_REVIEW__:';

function clampRating(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) {
    return null;
  }

  return Math.min(5, Math.max(0, Math.round(value)));
}

export function serializeReviewFeedback(comment: string, rating: number | null | undefined) {
  const normalizedComment = comment.trim();
  const normalizedRating = clampRating(rating);

  if (normalizedRating == null) {
    return normalizedComment;
  }

  return `${REVIEW_FEEDBACK_PREFIX}${JSON.stringify({
    comment: normalizedComment,
    rating: normalizedRating,
  })}`;
}

export function parseReviewFeedback(reviewComment?: string | null, reviewRating?: number | null): ReviewFeedback {
  const normalizedRating = clampRating(reviewRating);

  if (!reviewComment) {
    return {
      comment: '',
      rating: normalizedRating,
    };
  }

  if (!reviewComment.startsWith(REVIEW_FEEDBACK_PREFIX)) {
    return {
      comment: reviewComment,
      rating: normalizedRating,
    };
  }

  try {
    const payload = JSON.parse(reviewComment.slice(REVIEW_FEEDBACK_PREFIX.length)) as Partial<ReviewFeedback>;

    return {
      comment: typeof payload.comment === 'string' ? payload.comment : '',
      rating: clampRating(payload.rating ?? normalizedRating),
    };
  } catch {
    return {
      comment: reviewComment,
      rating: normalizedRating,
    };
  }
}
