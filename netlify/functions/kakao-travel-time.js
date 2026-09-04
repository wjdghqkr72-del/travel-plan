// 카카오 경로 조회 API는 브라우저에서 직접 호출하면 CORS로 막혀서,
// 이 서버리스 함수가 대신 카카오에 요청을 보내고 결과만 페이지로 돌려줍니다.
// 카카오 REST API 키는 이 파일이 아니라 Netlify 환경변수(KAKAO_REST_API_KEY)에 저장해서 사용합니다.

exports.handler = async function (event) {
  const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;
  const { origin, destination } = event.queryStringParameters || {};

  const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };

  if (!origin || !destination) {
    return {
      statusCode: 400,
      headers: jsonHeaders,
      body: JSON.stringify({ error: "출발지와 도착지가 필요합니다." }),
    };
  }
  if (!KAKAO_REST_API_KEY) {
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({
        error: "서버에 KAKAO_REST_API_KEY 환경변수가 설정되어 있지 않습니다.",
      }),
    };
  }

  const authHeaders = { Authorization: "KakaoAK " + KAKAO_REST_API_KEY };

  async function geocode(query) {
    const url =
      "https://dapi.kakao.com/v2/local/search/keyword.json?query=" +
      encodeURIComponent(query);
    const res = await fetch(url, { headers: authHeaders });
    if (!res.ok) throw new Error("geocode-failed:" + res.status);
    const data = await res.json();
    const doc = data.documents && data.documents[0];
    return doc ? { x: doc.x, y: doc.y, name: doc.place_name } : null;
  }

  async function walkTime(start, end) {
    const url =
      "https://dapi.kakao.com/v2/routing/walk" +
      "?start_x=" + encodeURIComponent(start.x) +
      "&start_y=" + encodeURIComponent(start.y) +
      "&end_x=" + encodeURIComponent(end.x) +
      "&end_y=" + encodeURIComponent(end.y);
    const res = await fetch(url, { headers: authHeaders });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== "OK" || !data.route) return null;
    return data.route.properties.totalTime;
  }

  async function transitTime(start, end) {
    const url =
      "https://dapi.kakao.com/v2/routing/publictraffic" +
      "?start_x=" + encodeURIComponent(start.x) +
      "&start_y=" + encodeURIComponent(start.y) +
      "&end_x=" + encodeURIComponent(end.x) +
      "&end_y=" + encodeURIComponent(end.y);
    const res = await fetch(url, { headers: authHeaders });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== "OK" || !data.routes || !data.routes.length) return null;
    let best = data.routes[0];
    data.routes.forEach((r) => {
      if (r.properties.totalTime < best.properties.totalTime) best = r;
    });
    return best.properties.totalTime;
  }

  try {
    const [originGeo, destGeo] = await Promise.all([
      geocode(origin),
      geocode(destination),
    ]);
    if (!originGeo || !destGeo) {
      return {
        statusCode: 200,
        headers: jsonHeaders,
        body: JSON.stringify({ error: "not-found" }),
      };
    }
    const [walkSeconds, transitSeconds] = await Promise.all([
      walkTime(originGeo, destGeo),
      transitTime(originGeo, destGeo),
    ]);
    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: JSON.stringify({ walkSeconds, transitSeconds }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({ error: String(err) }),
    };
  }
};
