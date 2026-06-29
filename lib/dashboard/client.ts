"use client";

/* ============================================================
   client.ts — typed Dashboard API client.
   One fetcher per endpoint + useDashboardQuery hook (SWR).
   Do NOT modify app/api/dashboard/* or lib/api/* — this only consumes them.
   ============================================================ */

import useSWR, { type SWRConfiguration } from "swr";
import type { DashboardFilters } from "@/lib/api/types";
import type {
  AnnualSalesResponse,
  BookingCurveResponse,
  ChannelsResponse,
  NationalitiesResponse,
  OccupancyResponse,
  RoomTypesResponse,
  StayNightsResponse,
} from "@/lib/api/types";
import { filtersToQuery } from "@/lib/dashboard/use-filters";

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    let code: string | undefined;
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) {
        code = body.error.code;
        message = body.error.message ?? message;
      }
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message, res.status, code);
  }
  return (await res.json()) as T;
}

export type DashboardEndpoint =
  | "occupancy"
  | "channels"
  | "nationalities"
  | "stay-nights"
  | "room-types"
  | "annual-sales"
  | "booking-curve";

/** Build the full `/api/dashboard/{endpoint}?...` URL for a filter set. */
export function buildUrl(
  endpoint: DashboardEndpoint,
  filters: DashboardFilters,
): string {
  return `/api/dashboard/${endpoint}?${filtersToQuery(filters)}`;
}

/* ---- typed fetchers (one per endpoint) ---- */
export const fetchOccupancy = (f: DashboardFilters) =>
  getJson<OccupancyResponse>(buildUrl("occupancy", f));
export const fetchChannels = (f: DashboardFilters) =>
  getJson<ChannelsResponse>(buildUrl("channels", f));
export const fetchNationalities = (f: DashboardFilters) =>
  getJson<NationalitiesResponse>(buildUrl("nationalities", f));
export const fetchStayNights = (f: DashboardFilters) =>
  getJson<StayNightsResponse>(buildUrl("stay-nights", f));
export const fetchRoomTypes = (f: DashboardFilters) =>
  getJson<RoomTypesResponse>(buildUrl("room-types", f));
export const fetchAnnualSales = (f: DashboardFilters) =>
  getJson<AnnualSalesResponse>(buildUrl("annual-sales", f));
export const fetchBookingCurve = (f: DashboardFilters) =>
  getJson<BookingCurveResponse>(buildUrl("booking-curve", f));

/** Map endpoint name -> its typed response (for useDashboardQuery generics). */
export interface EndpointResponseMap {
  occupancy: OccupancyResponse;
  channels: ChannelsResponse;
  nationalities: NationalitiesResponse;
  "stay-nights": StayNightsResponse;
  "room-types": RoomTypesResponse;
  "annual-sales": AnnualSalesResponse;
  "booking-curve": BookingCurveResponse;
}

export interface DashboardQueryResult<T> {
  data: T | undefined;
  error: ApiError | undefined;
  isLoading: boolean;
  isValidating: boolean;
  mutate: () => void;
}

/**
 * Fetch a dashboard endpoint with the given filters (SWR-backed).
 * Returns the typed response for the named endpoint.
 *
 *   const { data, isLoading } = useDashboardQuery("occupancy", filters);
 *   data?.summary.occupancyRate // typed
 */
export function useDashboardQuery<K extends DashboardEndpoint>(
  endpoint: K,
  filters: DashboardFilters,
  options?: SWRConfiguration<EndpointResponseMap[K], ApiError>,
): DashboardQueryResult<EndpointResponseMap[K]> {
  const key = buildUrl(endpoint, filters);
  const { data, error, isLoading, isValidating, mutate } = useSWR<
    EndpointResponseMap[K],
    ApiError
  >(key, (url: string) => getJson<EndpointResponseMap[K]>(url), {
    revalidateOnFocus: false,
    keepPreviousData: true,
    ...options,
  });
  return { data, error, isLoading, isValidating, mutate: () => void mutate() };
}
