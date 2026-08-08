/**
 * A place as the Google Maps actor sees it, normalized. Same nullability
 * discipline as the Fact Sheet: unpublished is null, nothing is inferred.
 */
export type Place = {
  name: string;
  address: string;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviews: number | null;
  categories: string[];
  lat: number;
  lng: number;
};
