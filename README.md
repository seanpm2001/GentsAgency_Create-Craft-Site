# Create Craft Site

Create a Craft site using the Gents Agency workflow.

## Usage

When you have `npm` >= 6 on your system, you can run

```sh
$ npm init @gentsagency/craft-site my-site
```

or if you have `npm` >= 5 on your system, you can run

```sh
$ npx @gentsagency/create-craft-site my-site
```

This will output:

```
👋 Creating a new Craft website in ~/Sites/my-site

📥 Installing Craft CMS & a front-end setup
☕️ This might take a while

🤖 Installing nystudio107/craft-scripts

🚢 Moving some files around

🔧 Tweaking your configuration

🌱 All set! Let's get you started:

    cd ~/Sites/demo-project
    ./craft/craft setup
    gulp watch

🤞 Good luck, have fun!
```

And you're good to go.

It will install [Craft CMS](https://craftcms.com/) and [@gentsagency/static-site](https://github.com/gentsagency/create-static-site).
