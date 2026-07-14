import { supabase, getDemoCurrentTimestamp } from '../supabase';

export async function getBloombergMarketContext(
  fxPair: string,
  asOfIso: string
): Promise<{
  news_headline: string;
  news_source: 'Bloomberg';
  news_event_type: string;
  fx_rate_mid: number;
  fx_rate_24h_delta_pct: number;
  historical_percentile_90d: number;
  historical_range_position: string;
}> {
  const asOf = asOfIso || getDemoCurrentTimestamp();

  const { data, error } = await supabase
    .from('bloomberg_market_snapshots')
    .select('*')
    .eq('fx_pair', fxPair)
    .lte('as_of_timestamp', asOf)
    .order('as_of_timestamp', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return {
      news_headline: 'No market data available',
      news_source: 'Bloomberg',
      news_event_type: 'none',
      fx_rate_mid: 0,
      fx_rate_24h_delta_pct: 0,
      historical_percentile_90d: 0,
      historical_range_position: 'unknown'
    };
  }

  return {
    news_headline: data.news_headline,
    news_source: data.news_source ?? 'Bloomberg',
    news_event_type: data.news_event_type,
    fx_rate_mid: Number(data.fx_rate_mid),
    fx_rate_24h_delta_pct: Number(data.fx_rate_24h_delta_pct),
    historical_percentile_90d: Number(data.historical_percentile_90d),
    historical_range_position: data.historical_range_position
  };
}

export async function get_bloomberg_market_context(args: {
  fx_pair: string;
  as_of_iso: string;
}) {
  return getBloombergMarketContext(args.fx_pair, args.as_of_iso);
}
