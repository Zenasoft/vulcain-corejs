import { IContainer } from '../di/resolvers';
import { Conventions } from '../utils/conventions';
import { DefaultServiceNames } from '../di/annotations';
import { IMetrics } from '../instrumentations/metrics';
import { HystrixSSEStream as hystrixStream } from '../commands/http/hystrixSSEStream';
import { Service } from "../globals/system";
import { VulcainPipeline } from "./vulcainPipeline";
import { NormalizeDataMiddleware } from "./middlewares/normalizeDataMiddleware";
import { AuthenticationMiddleware } from "./middlewares/authenticationMiddleware";
import { HandlersMiddleware } from "./middlewares/handlersMiddleware";
import { IServerAdapter, HttpAdapter } from './serverAdapter';

export class VulcainServer {
    private metrics: IMetrics;
    public adapter: IServerAdapter;

    constructor(protected domainName: string, protected container: IContainer) {
        this.metrics = container.get<IMetrics>(DefaultServiceNames.Metrics);

        this.adapter = this.container.get<IServerAdapter>(DefaultServiceNames.ServerAdapter, true) || new HttpAdapter();
        this.adapter.init(container,
            new VulcainPipeline([
                new NormalizeDataMiddleware(),
                new AuthenticationMiddleware(),
                new HandlersMiddleware(container)
            ]));
        this.container.injectInstance(this.adapter, DefaultServiceNames.ServerAdapter); // Override current adapter
    }

    public start(port: number) {
        // Hystrix stream
        this.adapter.registerNativeRoute("get", Conventions.instance.defaultHystrixPath, (request, response) => {
            response.setHeader('Content-Type', 'text/event-stream;charset=UTF-8');
            response.setHeader('Cache-Control', 'no-cache, no-store, max-age=0, must-revalidate');
            response.setHeader('Pragma', 'no-cache');
            //     System.log.info(null, () => "get hystrix.stream");

            let subscription = hystrixStream.toObservable().subscribe(
                function onNext(sseData) {
                    response.write('data: ' + sseData + '\n\n');
                },
                function onError(error) {
                    Service.log.error(null, error, () => "hystrixstream: error");
                },
                function onComplete() {
                    //     System.log.info(null, () => "end hystrix.stream");
                    return response.end();
                }
            );
            request.on("close", () => {
                //    System.log.info(null, () => "close hystrix.stream");
                subscription.unsubscribe();
            });
        });

        this.adapter.registerNativeRoute('get', '/health', (req, res) => {
            res.statusCode = 200;
            res.end();
        });

        this.container.getCustomEndpoints().forEach(e => {
            this.adapter.registerRoute(e.verb, e.path, e.handler);
        });

        this.adapter.start(port, (err) => Service.log.info(null, () => 'Listening on port ' + port));
    }
}