# Lambdaの更新方法
```sh
cd /develop/project/histrical-person && touch lambdas/render_audio_video/main.py && cd cdk && export AWS_PROFILE=histrical && npx cdk deploy --require-approval never 2>&1 | grep -E "(Building|UPDATE_COMPLETE|success)" | tail -8
```