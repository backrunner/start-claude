export var SpeedTestStrategy;
(function (SpeedTestStrategy) {
    SpeedTestStrategy["ResponseTime"] = "response-time";
    SpeedTestStrategy["HeadRequest"] = "head-request";
    SpeedTestStrategy["Ping"] = "ping";
})(SpeedTestStrategy || (SpeedTestStrategy = {}));
export var LoadBalancerStrategy;
(function (LoadBalancerStrategy) {
    LoadBalancerStrategy["Fallback"] = "Fallback";
    LoadBalancerStrategy["Polling"] = "Polling";
    LoadBalancerStrategy["SpeedFirst"] = "Speed First";
})(LoadBalancerStrategy || (LoadBalancerStrategy = {}));
export const CURRENT_CONFIG_VERSION = 3;
export const CURRENT_S3_CONFIG_VERSION = 1;
